import { nearestDemand } from "@/lib/agents/rag";
import { lookupBook } from "@/lib/catalog/lookup";
import { toIsbn13 } from "@/lib/geo";
import type { SpineRead } from "@/lib/scan/ocr";

/**
 * Turn messy spine OCR into something the desk can price.
 *
 * Spine text is not a title. It arrives as "THE NAME OF THE WIND ROTHFUSS PAT
 * 9780756404741 TOR" — title, author, ISBN and imprint in one blob, in whatever
 * order the designer chose. So resolution runs strongest-signal first:
 *
 *   ISBN (exact, checksum-verified) → bundled catalog (TF-IDF) → Open Library → raw text
 *
 * The ISBN path matters most: barcodes are on the back cover, but a lot of spines
 * print the ISBN vertically in small type, and OCR picks it up often enough to be
 * worth checking first.
 */
export type SpineGuess = {
  text: string;
  title: string;
  author: string;
  isbn?: string;
  subject?: string;
  source: "isbn" | "catalog" | "openlibrary" | "raw";
  similarity: number;
  confidence: number;
};

/** OCR confuses digits with letters; map them back inside digit-ish runs. */
const DIGIT_FIXES: Record<string, string> = {
  O: "0",
  o: "0",
  Q: "0",
  D: "0",
  I: "1",
  l: "1",
  i: "1",
  "|": "1",
  Z: "2",
  S: "5",
  s: "5",
  B: "8",
  G: "6",
};

function normaliseDigits(run: string): string {
  return run
    .split("")
    .map((char) => DIGIT_FIXES[char] ?? char)
    .join("");
}

/**
 * Every window of a digit run that could be a whole ISBN.
 *
 * Thirteen digits may be sliced out of a longer run — OCR glues the barcode to
 * whatever follows it. Ten digits may not: a random ten-digit slice passes the
 * ISBN-10 check digit about one time in eleven, so slicing turns every price and
 * imprint code into a book. An ISBN-10 has to be printed as its own token.
 */
function windows(digits: string): string[] {
  const out = new Set<string>();
  if (digits.length === 13) out.add(digits);
  if (digits.length > 13) {
    out.add(digits.slice(0, 13));
    out.add(digits.slice(-13));
  }
  if (digits.length === 10) out.add(digits);
  return [...out];
}

/**
 * Find a checksum-valid ISBN-10 or ISBN-13 in raw spine text.
 *
 * Two passes: plain digit runs (with the spaces and hyphens designers print), then a
 * repaired pass where OCR's favourite confusions — O/0, I/1, S/5, B/8 — are undone.
 * Every candidate goes through the real check digit, so a stray number in a blurb or
 * an imprint code is rejected rather than priced as a book.
 */
export function extractIsbn(raw: string): string | null {
  const plain = raw.match(/\d(?:[\d\s-]{7,19})\d/g) ?? [];
  for (const run of plain) {
    for (const candidate of windows(run.replace(/\D/g, ""))) {
      const isbn = toIsbn13(candidate);
      if (isbn) return isbn;
    }
  }

  const loose = raw.match(/[0-9OoQDIli|ZSsBG]{10,20}/g) ?? [];
  for (const run of loose) {
    for (const candidate of windows(normaliseDigits(run))) {
      const isbn = toIsbn13(candidate);
      if (isbn) return isbn;
    }
  }
  return null;
}

/** Collapse OCR noise into one line of plausible title text. */
export function cleanSpineText(raw: string): string {
  return raw
    .replace(/\s+/g, " ")
    .replace(/[^A-Za-z0-9'&:.,() -]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Strip imprint words and trailing author blocks that spines always carry. */
const NOISE = new Set([
  "a",
  "an",
  "the",
  "novel",
  "press",
  "books",
  "book",
  "edition",
  "paperback",
  "international",
  "bestseller",
  "new",
  "york",
  "times",
]);

function titleFromText(text: string): string {
  const words = text.split(" ").filter(Boolean);
  const kept: string[] = [];
  for (const word of words) {
    const bare = word.toLowerCase().replace(/[^a-z]/g, "");
    if (!bare) continue;
    if (NOISE.has(bare) && kept.length > 1) continue;
    if (bare.length < 2 && !/\d/.test(word)) continue;
    kept.push(word);
    if (kept.length >= 12) break;
  }
  return kept.join(" ").trim();
}

/** TF-IDF match against the bundled demand catalog. */
export function catalogMatches(text: string, k = 3): { title: string; author: string; subject: string; similarity: number }[] {
  return nearestDemand(text, k)
    .filter((row) => row.sim > 0.12)
    .map((row) => ({
      title: row.book.title,
      author: row.book.author,
      subject: row.book.subject,
      similarity: Math.round(row.sim * 100) / 100,
    }));
}

type OpenLibraryDoc = {
  title?: string;
  author_name?: string[];
  isbn?: string[];
  subject?: string[];
};

async function openLibrarySearch(text: string): Promise<SpineGuess[]> {
  if (typeof fetch === "undefined") return [];
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const url = `https://openlibrary.org/search.json?q=${encodeURIComponent(text)}&limit=3&fields=title,author_name,isbn,subject`;
    const response = await fetch(url, { signal: controller.signal, headers: { accept: "application/json" } });
    if (!response.ok) return [];
    const payload = (await response.json()) as { docs?: OpenLibraryDoc[] };
    return (payload.docs ?? [])
      .filter((doc) => Boolean(doc.title))
      .map((doc) => ({
        text,
        title: doc.title ?? "",
        author: doc.author_name?.[0] ?? "",
        isbn: doc.isbn?.[0],
        subject: doc.subject?.[0],
        source: "openlibrary" as const,
        similarity: 0.5,
        confidence: 0,
      }));
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Resolve one spine read into ranked book guesses. Always returns at least one
 * guess: the raw OCR text, so an unknown book can still be judged on its own.
 */
export async function resolveSpine(
  read: SpineRead,
  opts: { offline?: boolean } = {},
): Promise<SpineGuess[]> {
  return resolveText(read.text, read.confidence, opts);
}

/**
 * Resolve arbitrary text into book guesses.
 *
 * Separate from `resolveSpine` so the UI can re-resolve what a person typed: when the
 * engine misreads a spine, correcting the title and asking again is far cheaper than
 * anything that could be done to the image.
 */
export async function resolveText(
  raw: string,
  confidence = 0,
  opts: { offline?: boolean } = {},
): Promise<SpineGuess[]> {
  const text = cleanSpineText(raw);
  if (!text) return [];
  const guesses: SpineGuess[] = [];

  const isbn = extractIsbn(text);
  if (isbn) {
    const meta = await lookupBook(isbn, { offline: opts.offline });
    if (meta.found) {
      guesses.push({
        text,
        title: meta.title || titleFromText(text),
        author: meta.author,
        isbn,
        subject: meta.subjects[0],
        source: "isbn",
        similarity: 1,
        confidence: confidence,
      });
    } else {
      guesses.push({
        text,
        title: titleFromText(text),
        author: "",
        isbn,
        source: "isbn",
        similarity: 0.9,
        confidence: confidence,
      });
    }
  }

  const title = titleFromText(text);
  for (const match of catalogMatches(title)) {
    if (guesses.some((guess) => guess.title === match.title)) continue;
    guesses.push({
      text,
      title: match.title,
      author: match.author,
      subject: match.subject,
      source: "catalog",
      similarity: match.similarity,
      confidence: confidence,
    });
  }

  if (!guesses.length && !opts.offline && title.length >= 4) {
    const remote = await openLibrarySearch(title);
    for (const guess of remote) guesses.push({ ...guess, confidence: confidence });
  }

  if (!guesses.length) {
    guesses.push({
      text,
      title: title || text,
      author: "",
      source: "raw",
      similarity: 0,
      confidence: confidence,
    });
  }

  return guesses.slice(0, 4);
}
