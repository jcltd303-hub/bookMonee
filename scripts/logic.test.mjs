/**
 * Logic tests for the parts that decide money.
 *
 * Run with `npm run test:logic`, which bundles `bench/test-entry.ts` first so the
 * suite can import the app's modules without path aliases. Node's own test runner, no
 * framework.
 *
 * These cover the rules that are easy to break and expensive to get wrong: an ISBN is
 * only real if its check digit agrees, the packer never stages a shipment that cannot
 * clear a label, a book is never counted twice, and the trading agent actually learns.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  acceptRead,
  assess,
  assignTitles,
  catalogVocabulary,
  decodeObb,
  decodeYolo,
  rotatedToAabb,
  nonMaxSuppression,
  toFrameBoxes,
  unletterbox,
  decodeEntities,
  extractIsbn,
  sameBook,
  supersedes,
  toIsbn13,
  quotesFor,
  offerFrom,
  packBins,
  UNIT_COST_USD,
  makeQ,
  qShapeOk,
  greedy,
  legalActions,
  Q_VERSION,
  anyReady,
  makeEnv,
  policyTable,
  pretrainedAgent,
  runEpisode,
  mulberry32,
  buyers,
  recordObservation,
  adjustedRate,
  ratesFor,
  totalObservations,
  matchBuyer,
  normaliseOffers,
  offersByDesk,
  quoteEndpoint,
} from "../.bench-test/logic.mjs";

test("ISBN-13 check digit is enforced, not just the shape", () => {
  assert.equal(toIsbn13("9781119659587"), "9781119659587");
  assert.equal(toIsbn13("9781119659588"), null, "one digit off must fail");
  assert.equal(toIsbn13("0134685997"), "9780134685991", "ISBN-10 converts");
  assert.equal(toIsbn13("0134685990"), null, "bad ISBN-10 check digit");
});

test("spine text yields the ISBN only when it is really there", () => {
  assert.equal(extractIsbn("THE NAME OF THE WIND ROTHFUSS 9780756404741 TOR"), "9780756404741");
  assert.equal(extractIsbn("97807564O4741 TOR BOOKS"), "9780756404741", "O read as zero");
  assert.equal(extractIsbn("A NOVEL 2024 1234567890123 PRESS"), null);
  assert.equal(extractIsbn("SAPIENS YUVAL NOAH HARARI"), null);
});

test("imported names lose their HTML entities", () => {
  assert.equal(decodeEntities("Nancy&apos;s book nook"), "Nancy's book nook");
  assert.equal(decodeEntities("Lynn&apos;s Library"), "Lynn's Library");
  assert.equal(decodeEntities("Bell &amp; Book"), "Bell & Book");
  assert.equal(decodeEntities("Curly&#39;s Corner"), "Curly's Corner");
  assert.equal(decodeEntities("Little Free Library"), "Little Free Library", "plain text is untouched");
});

test("shelf matching resolves reads against each other, not just the catalogue", () => {
  // Two reads both lean toward the same title; the weaker one has a better second
  // choice, and joint assignment finds it. Independent retrieval would give both the
  // same book and lose the other.
  const reads = [
    { id: "TEACH YOURSEL", candidates: [{ title: "Teach Yourself French", score: 0.62 }, { title: "Larousse", score: 0.3 }] },
    { id: "LAROUSSE DICT", candidates: [{ title: "Teach Yourself French", score: 0.55 }, { title: "Larousse", score: 0.58 }] },
  ];
  const assigned = assignTitles(reads);
  const byId = Object.fromEntries(assigned.map((row) => [row.id, row.title]));
  assert.equal(byId["TEACH YOURSEL"], "Teach Yourself French");
  assert.equal(byId["LAROUSSE DICT"], "Larousse", "the weaker claim moves to its second choice");
});

test("two copies of one book are allowed when the reads are identical", () => {
  const reads = [
    { id: "DUNE", candidates: [{ title: "Dune", score: 0.9 }] },
    { id: "DUNE", candidates: [{ title: "Dune", score: 0.9 }] },
  ];
  assert.equal(assignTitles(reads).length, 2, "a duplicate spine is not a conflict");
  assert.ok(assignTitles(reads).every((row) => row.title === "Dune"));
});

test("a read with nothing above the floor still keeps its best guess", () => {
  const assigned = assignTitles([{ id: "???", candidates: [{ title: "Something", score: 0.1 }] }], 0.25);
  assert.equal(assigned.length, 1);
  assert.equal(assigned[0].title, "Something");
});

test("YOLO output decodes in both layouts", () => {
  // Two anchors, one class: [cx, cy, w, h, score]. Transposed layout is what most
  // exporters emit — 5 rows by 2 anchors, column-major over anchors.
  const transposed = new Float32Array([
    100, 200, // cx
    150, 200, // cy
    40, 40, // w
    300, 300, // h
    0.9, 0.2, // score
  ]);
  const a = decodeYolo(transposed, [5, 2], { transposed: true, minScore: 0.35 });
  assert.equal(a.length, 1, "the low-score anchor is dropped");
  assert.deepEqual({ x: a[0].x, y: a[0].y, w: a[0].w, h: a[0].h }, { x: 100, y: 150, w: 40, h: 300 });

  // Same two anchors, row-major: [cx, cy, w, h, score] per row.
  const plain = new Float32Array([100, 150, 40, 300, 0.9, 150, 200, 40, 300, 0.2]);
  const b = decodeYolo(plain, [2, 5], { transposed: false, minScore: 0.35 });
  assert.equal(b.length, 1);
  // Float32 in the tensor, so compare with a tolerance rather than against 0.9 exactly.
  assert.ok(Math.abs(b[0].score - 0.9) < 1e-6, `score ${b[0].score}`);
  assert.equal(b[0].x, 100);
});

test("an oriented box model is decoded, and its angle becomes bounds", () => {
  // Ultralytics OBB layout: [cx, cy, w, h, score, angle] as rows, one anchor per column.
  const data = new Float32Array([
    100, 300, // cx
    200, 200, // cy
    40, 60, // w
    300, 80, // h
    0.9, 0.1, // score
    0, Math.PI / 4, // angle
  ]);
  const boxes = decodeObb(data, [6, 2], { minScore: 0.35 });
  assert.equal(boxes.length, 1, "the low-score anchor is dropped");
  // Angle 0: bounds are the box itself.
  assert.deepEqual({ w: Math.round(boxes[0].w), h: Math.round(boxes[0].h) }, { w: 40, h: 300 });

  // At 45 degrees a 40x100 box bounds to about 99x99: wider than the box, shorter than its
  // length, and square — which is what "contains the rotation" actually means.
  const tilted = rotatedToAabb(100, 200, 40, 100, Math.PI / 4);
  assert.equal(Math.round(tilted.w), 99);
  assert.equal(Math.round(tilted.h), 99);
  assert.ok(tilted.w > 40, "wider than the unrotated box");
});

test("overlapping detections collapse, separate ones survive", () => {
  const boxes = [
    { x: 100, y: 150, w: 40, h: 300, score: 0.9 },
    { x: 102, y: 150, w: 40, h: 300, score: 0.7 }, // nearly the same spine
    { x: 200, y: 150, w: 40, h: 300, score: 0.8 }, // its neighbour
  ];
  const kept = nonMaxSuppression(boxes, 0.45);
  assert.equal(kept.length, 2);
  assert.deepEqual(kept.map((box) => Math.round(box.x)), [100, 200]);
});

test("letterboxing is undone and boxes are clipped to the frame", () => {
  // A 640x640 letterbox of a 1280x640 frame: scale 0.5, padded 160px top and bottom.
  const box = { scale: 0.5, padX: 0, padY: 160 };
  const centred = unletterbox({ x: 320, y: 320, w: 40, h: 200, score: 0.9 }, box);
  assert.deepEqual(
    { x: centred.x, y: centred.y, w: centred.w, h: centred.h },
    { x: 640, y: 320, w: 80, h: 400 },
  );
  const clipped = toFrameBoxes(
    [
      { x: 10, y: 320, w: 100, h: 400, score: 0.9 }, // runs off the left edge
      { x: 320, y: 320, w: 2, h: 200, score: 0.9 }, // too thin to be a spine (4px in the frame)
    ],
    box,
    1280,
    640,
  );
  assert.equal(clipped.length, 1, "the sliver is dropped, the edge box is kept and clipped");
  assert.equal(clipped[0].x, 0);
});

test("reads from a real phone session are dropped, not carded", () => {
  // Exactly what the live app produced from a shelf of legible books — the gate waved
  // all of these through on shape alone and left six cards of noise to dismiss.
  const junk = [
    ["UV-B AE ETH IETIRI DIEDEDY en", 35],
    ["es BB ErEsmE", 36],
    ["ER BER wa EE DE SEE Tinie", 39],
    ["TEE ames IE BE LE YS", 34],
    ["pm WISIN BIEBER", 32],
  ];
  for (const [text, confidence] of junk) {
    const verdict = acceptRead(text, confidence, catalogVocabulary);
    assert.equal(verdict.accept, false, `should drop ${JSON.stringify(text)}`);
  }

  // A real title that the vocabulary has never seen still gets through on confidence.
  assert.equal(acceptRead("1B THE CHAKRAS ACTIVITY JOURNAL Hiv JERSE", 52, catalogVocabulary).accept, true);
  assert.equal(acceptRead("ORGANIC CHEMISTRY", 95, catalogVocabulary).accept, true);
  // And two known words are enough even at low confidence.
  assert.equal(acceptRead("THE HUNGER GAMES", 20, catalogVocabulary).accept, true);
});

test("the plausibility gate rejects symbol soup", () => {
  assert.equal(assess("ORGANIC CHEMISTRY").plausible, true);
  assert.equal(assess("THE HUNGER GAMES").plausible, true);
  assert.equal(assess(">[as J u = LL Z C [S z < @").plausible, false);
  assert.equal(assess("4 hN").plausible, false);
  assert.equal(assess("ad a &").plausible, false, "short and letter-heavy is still not a book");
  assert.equal(assess("").plausible, false);
});

test("a spine read twice is one book", () => {
  assert.equal(sameBook({ isbn: "9781119659587", title: "Organic Chemistry" }, { isbn: "9781119659587", title: "Organic Chem" }), true);
  assert.equal(
    sameBook({ isbn: "ocr-a", title: "AMERICAN DECORATION THOMAS JAYNE" }, { isbn: "ocr-b", title: "American Decoration" }),
    true,
    "title overlap catches OCR-only reads",
  );
  assert.equal(sameBook({ isbn: "ocr-a", title: "GARDEN PARK" }, { isbn: "ocr-b", title: "THE HUNGER GAMES" }), false);
  assert.equal(
    sameBook({ isbn: "9781119659587", title: "Organic Chemistry" }, { isbn: "9780134685991", title: "Organic Chemistry" }),
    false,
    "different ISBNs are different books",
  );
});

test("a barcode scan upgrades the OCR guess it confirms", () => {
  const ocr = { isbn: "ocr-7f2a", title: "AMERICAN DECORATION THOMAS JAYNE" };
  const barcode = { isbn: "9781580934056", title: "American Decoration" };
  assert.equal(supersedes(barcode, ocr), true, "confirmed read replaces the guess");
  assert.equal(supersedes(ocr, barcode), false, "a guess never replaces a confirmed ISBN");
  assert.equal(
    supersedes({ isbn: "9781119659587", title: "Organic Chemistry" }, { isbn: "ocr-x", title: "THE HUNGER GAMES" }),
    false,
    "unrelated books both survive",
  );
});

test("quotes never go negative and respect condition", () => {
  const book = { isbn: "9781119659587", title: "Organic Chemistry", demandUsd: 78, lane: "textbook", condition: "good" };
  const quotes = quotesFor(book);
  assert.equal(quotes.length, buyers.length);
  for (const quote of quotes) assert.ok(quote.offerUsd >= 0);
  const good = offerFrom(book, buyers[0]);
  const poor = offerFrom({ ...book, condition: "poor" }, buyers[0]);
  assert.equal(poor, 0, "textbooks in poor condition are refused outright");
  assert.ok(good > 0);
});

test("the packer never stages a shipment that cannot clear its label", () => {
  const plan = packBins([
    { isbn: "9781119659587", title: "Organic Chemistry", demandUsd: 78, lane: "textbook", condition: "good" },
    { isbn: "9780062316097", title: "Sapiens", demandUsd: 6, lane: "trade", condition: "good" },
    { isbn: "9780441172719", title: "Dune", demandUsd: 3, lane: "trade", condition: "fair" },
  ]);
  for (const bin of plan.bins) {
    assert.ok(bin.clearsThreshold, `${bin.buyerName} staged without clearing its label`);
    assert.ok(bin.stagedUsd >= bin.thresholdUsd);
  }
  assert.ok(plan.netUsd > 0);
  assert.equal(
    Math.round((plan.grossUsd - plan.costUsd - plan.frictionUsd) * 100) / 100,
    plan.netUsd,
    "net must equal gross minus cost minus friction",
  );
});

test("the packer is deterministic and never pays more cost than books staged", () => {
  const shelf = [
    { isbn: "9781119659587", title: "Organic Chemistry", demandUsd: 78, lane: "textbook", condition: "good" },
    { isbn: "9780134685991", title: "Effective Java", demandUsd: 42, lane: "textbook", condition: "good" },
  ];
  const first = packBins(shelf);
  const second = packBins(shelf);
  assert.deepEqual(second.bins, first.bins);
  const staged = first.bins.reduce((sum, bin) => sum + bin.items.length, 0);
  assert.equal(first.costUsd, Math.round(staged * UNIT_COST_USD * 100) / 100);
});

test("live quotes retune a desk, slowly", () => {
  const buyer = buyers[0];
  const obs = { buyerId: buyer.id, offerUsd: 0, demandUsd: 100, condition: "good", lane: "textbook" };
  // A quote well above what the model predicts should raise the rate, but one quote
  // must not move it far: the prior is worth PRIOR_STRENGTH observations.
  const predicted = 100 * buyer.payRate * buyer.textbookFit;
  let cal = recordObservation({}, { ...obs, offerUsd: predicted * 2 });
  const afterOne = adjustedRate(buyer, cal);
  assert.ok(afterOne > buyer.payRate, "a high quote raises the rate");
  assert.ok(afterOne < buyer.payRate * 1.15, "one quote moves it by under a tenth");

  for (let i = 0; i < 20; i += 1) cal = recordObservation(cal, { ...obs, offerUsd: predicted * 2 });
  const afterMany = adjustedRate(buyer, cal);
  assert.ok(afterMany > afterOne, "more evidence moves it further");
  assert.ok(afterMany < buyer.payRate * 2, "and converges toward the observed ratio without reaching it");

  // The band holds even under absurd evidence.
  let wild = {};
  for (let i = 0; i < 200; i += 1) wild = recordObservation(wild, { ...obs, offerUsd: predicted * 50 });
  assert.ok(adjustedRate(buyer, wild) <= buyer.payRate * 3, "a rate can never run away");

  assert.equal(totalObservations(cal), 21);
  assert.equal(ratesFor(cal)[buyer.id], afterMany);
});

test("a zero quote is not evidence about the desk's rate", () => {
  const buyer = buyers[0];
  const cal = recordObservation({}, { buyerId: buyer.id, offerUsd: 0, demandUsd: 100, condition: "good", lane: "textbook" });
  assert.equal(totalObservations(cal), 0);
  assert.equal(adjustedRate(buyer, cal), buyer.payRate);
});

test("live payloads are matched to desks and deduped to the best offer", () => {
  assert.equal(matchBuyer("booksrun"), "booksrun");
  assert.equal(matchBuyer("World of Books"), "worldofbooks");
  assert.equal(matchBuyer("Top Dollar 4 Books"), "topdollar");
  assert.equal(matchBuyer("Some Other Shop"), null);

  const offers = normaliseOffers({
    offers: [
      { buyerId: "booksrun", usd: 3.1 },
      { buyer: "BooksRun", offerUsd: 4.2 },
      { buyer: "World of Books", usd: 2 },
      { buyer: "Unknown Vendor", usd: 99 },
      { buyerId: "valore", usd: 0 },
    ],
  });
  assert.deepEqual(offersByDesk({ isbn: "x", offers, at: 0, ok: true }), { booksrun: 4.2, worldofbooks: 2 });
  assert.equal(offers.length, 2);
  assert.equal(quoteEndpoint(), "/api/quotes", "falls back to this deployment's proxy");
});

test("a live offer beats the model and is marked live", () => {
  const book = { isbn: "9781119659587", title: "Organic Chemistry", demandUsd: 78, lane: "textbook", condition: "good" };
  const modelled = quotesFor(book);
  const live = quotesFor(book, {}, { live: { booksrun: 9.99 } });
  const liveRun = live.find((quote) => quote.buyerId === "booksrun");
  const modelRun = modelled.find((quote) => quote.buyerId === "booksrun");
  assert.equal(liveRun.offerUsd, 9.99);
  assert.equal(liveRun.modelled, false);
  assert.equal(modelRun.modelled, true);
  assert.notEqual(modelRun.offerUsd, 9.99);
});

test("an illegal action is never chosen, however high its value", () => {
  assert.deepEqual(legalActions(false), [true, true, false], "no cleared bin, no shipping");
  assert.deepEqual(legalActions(true), [true, true, true]);
  // A ship value that dwarfs everything, in a state with nothing to ship.
  const agent = makeQ();
  agent.w[2 * 7 + 0] = 999;
  const x = [0.6, 1.4, 0, 0, 0, 0.8, 0];
  assert.equal(greedy(agent, x), 2, "without masking the huge ship value wins");
  const masked = greedy(agent, x, legalActions(false));
  assert.notEqual(masked, 2, "with masking it cannot be chosen");
  assert.ok(legalActions(false)[masked], "and the choice is a legal one");
});

test("a book that cannot clear its own cost is never staged", () => {
  assert.deepEqual(legalActions(false, false), [true, false, false]);
  assert.deepEqual(legalActions(true, false), [true, false, true]);
  const agent = makeQ();
  agent.w[1 * 7 + 0] = 999; // staging looks enormously valuable
  const x = [0.02, -0.6, 0, 0, 0, 0.9, 0];
  assert.equal(greedy(agent, x), 1, "without the gate the huge stage value wins");
  assert.notEqual(greedy(agent, x, legalActions(false, false)), 1, "with it, staging is not offered");
});

test("a bin is only ready when it has cleared its label", () => {
  const env = makeEnv();
  env.bins[0] = 2; // below the first desk's label
  assert.equal(anyReady(env), false);
  env.bins[0] = (env.thresholds[0] ?? 0) + 1;
  assert.equal(anyReady(env), true);
});

test("weights from an older action model are discarded", () => {
  assert.equal(makeQ().version, Q_VERSION);
  assert.equal(qShapeOk({ ...makeQ(), version: Q_VERSION - 1 }), false, "v1 agents are not reused");
});

test("the policy still holds after a long run", () => {
  // The collapse this guards against appeared only after tens of thousands of shelves:
  // at 84,000 the policy was "ship" in every state, including with empty bins.
  const agent = pretrainedAgent(20000);
  const policy = Object.fromEntries(policyTable(agent).map((row) => [row.label, row.action]));
  assert.equal(policy["Good book, bins empty"], "Stage to the best desk");
  assert.equal(policy["Good book, label nearly clear"], "Stage to the best desk");
  assert.equal(policy["Thin book, label already clear"], "Ship the ready bin");
  assert.equal(policy["Bad book, bins empty"], "Skip");
});

test("the trading agent starts ignorant and learns to make money", () => {
  const fresh = makeQ();
  assert.equal(greedy(fresh, [0.6, 1.4, 0, 0, 0, 0.8, 0]), 0, "all weights zero means skip");

  const trained = pretrainedAgent(600);
  const random = mulberry32(11);
  let before = 0;
  let after = 0;
  for (let i = 0; i < 150; i += 1) {
    before += runEpisode(fresh, mulberry32(11 + i), { learn: false, epsilon: 0 }).reward;
    after += runEpisode(trained, random, { learn: false, epsilon: 0 }).reward;
  }
  assert.ok(after > before + 50, `expected real learning, got ${before} -> ${after}`);

  const policy = policyTable(trained);
  const good = policy.find((row) => row.label === "Good book, bins empty");
  assert.equal(good?.action, "Stage to the best desk");
  const bad = policy.find((row) => row.label === "Bad book, bins empty");
  assert.equal(bad?.action, "Skip");
});
