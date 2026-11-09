/**
 * Is this the same book as one already read?
 *
 * Reading a shelf means panning and reading again, so the same spine comes back
 * several times with slightly different OCR text. Keyed on the raw text, each read
 * was a new book: the packer then staged two copies of a title you hold one of, and
 * quoted a $57 textbook twice. So identity is ISBN when both sides have one, and
 * title overlap when they do not.
 */
export type Identity = { isbn: string; title: string };

const REAL_ISBN = /^\d{10,13}$/;

function tokens(title: string): Set<string> {
  return new Set(
    title
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((token) => token.length > 2),
  );
}

/** Share of `want` that appears in `have`. */
function recall(want: Set<string>, have: Set<string>): number {
  if (!want.size) return 0;
  let hit = 0;
  for (const token of want) if (have.has(token)) hit += 1;
  return hit / want.size;
}

/** Title overlap in either direction, 0..1. */
export function titleOverlap(a: string, b: string): number {
  const left = tokens(a);
  const right = tokens(b);
  if (!left.size || !right.size) return 0;
  return Math.max(recall(left, right), recall(right, left));
}

/**
 * Does `next` replace `prev`?
 *
 * A barcode scan is the confirmation step: when it lands, the OCR guess it confirms
 * should be upgraded rather than left beside it as a second book. Titles are compared
 * loosely here because the OCR title is exactly the thing that was wrong.
 */
export function supersedes(next: Identity, prev: Identity): boolean {
  const nextReal = REAL_ISBN.test(next.isbn);
  const prevReal = REAL_ISBN.test(prev.isbn);
  if (nextReal && prevReal) return next.isbn === prev.isbn;
  // A confirmed ISBN always wins over a guess, whatever the titles say.
  if (nextReal) return sameBook(next, prev) || titleOverlap(next.title, prev.title) >= 0.5;
  if (prevReal) return false;
  return sameBook(next, prev);
}

export function sameBook(a: Identity, b: Identity): boolean {
  if (REAL_ISBN.test(a.isbn) && REAL_ISBN.test(b.isbn)) return a.isbn === b.isbn;
  const left = tokens(a.title);
  const right = tokens(b.title);
  if (!left.size || !right.size) return false;
  // Symmetric: one title being a fragment of the other still counts.
  return recall(left, right) >= 0.75 || recall(right, left) >= 0.75;
}
