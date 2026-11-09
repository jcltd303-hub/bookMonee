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
  assess,
  extractIsbn,
  sameBook,
  supersedes,
  toIsbn13,
  quotesFor,
  offerFrom,
  packBins,
  UNIT_COST_USD,
  makeQ,
  greedy,
  policyTable,
  pretrainedAgent,
  runEpisode,
  mulberry32,
  buyers,
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
