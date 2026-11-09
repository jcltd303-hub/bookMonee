import { books } from "@/lib/catalog";
import type { DemandBook } from "@/lib/types";

const STOP = new Set(["the", "and", "for", "with", "its", "from", "edition", "textbook"]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 2 && !STOP.has(token));
}

const docs = books.books.map((book) => ({
  book,
  tokens: tokenize(`${book.title} ${book.author} ${book.subject} ${book.lane}`),
}));

/** Every token in the demand catalog — used as the known-word set for OCR gating. */
export const catalogVocabulary: Set<string> = new Set(docs.flatMap((doc) => doc.tokens));

const df = new Map<string, number>();
for (const doc of docs) {
  for (const token of new Set(doc.tokens)) df.set(token, (df.get(token) ?? 0) + 1);
}

function weight(token: string): number {
  const n = df.get(token) ?? 0;
  if (!n) return 0;
  return 1 + Math.log(docs.length / n);
}

function vector(tokens: string[]): Map<string, number> {
  const vec = new Map<string, number>();
  for (const token of tokens) {
    const w = weight(token);
    if (w) vec.set(token, (vec.get(token) ?? 0) + w);
  }
  return vec;
}

function cosine(a: Map<string, number>, b: Map<string, number>): number {
  let dot = 0;
  let aa = 0;
  let bb = 0;
  for (const value of a.values()) aa += value * value;
  for (const value of b.values()) bb += value * value;
  if (!aa || !bb) return 0;
  for (const [token, value] of a) {
    const other = b.get(token);
    if (other) dot += value * other;
  }
  return dot / Math.sqrt(aa * bb);
}

const indexed = docs.map((doc) => ({ book: doc.book, vec: vector(doc.tokens) }));

export function nearestDemand(query: string, k = 3): { book: DemandBook; sim: number }[] {
  const vec = vector(tokenize(query));
  return indexed
    .map((row) => ({ book: row.book, sim: cosine(vec, row.vec) }))
    .sort((a, b) => b.sim - a.sim)
    .filter((row) => row.sim > 0.05)
    .slice(0, k);
}

export function demandByIsbn(isbn: string): DemandBook | undefined {
  return books.books.find((book) => book.isbn13 === isbn);
}
