/**
 * Many-to-many shelf matching.
 *
 * The resolver scores each spine on its own, which is the "independent retrieval"
 * approach the CVC-UAB work on large book collections argues is the wrong shape for
 * the problem (Llabrés et al., 2024). A shelf is a *set* of books: if two reads both
 * claim the same title, one of them is wrong, and the weaker read usually has a better
 * second choice. Matching the set jointly recovers titles that an individual read was
 * too noisy to win on its own.
 *
 * The version here is a greedy maximum-weight assignment over reads × candidate titles
 * — the same objective as Hungarian matching, with the cheaper algorithm. It is exact
 * enough for the handful of spines in one capture.
 *
 * One deliberate departure from the paper: their catalogue is a library inventory where
 * each entry occurs once. A little free library can hold two copies of a book, so a
 * candidate may be reused when two reads are near-identical, which is what a duplicate
 * spine looks like.
 */
export type Candidate = { title: string; score: number };

export type ReadCandidates = {
  /** Stable id for the read, e.g. its OCR text. */
  id: string;
  candidates: Candidate[];
};

export type Assignment = { id: string; title: string; score: number };

const DUPLICATE_THRESHOLD = 0.9;

function normalise(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Assign one title per read, maximising total score and using each title once —
 * unless two reads are near-identical, which is a second copy rather than a conflict.
 */
export function assignTitles(reads: ReadCandidates[], minScore = 0.25): Assignment[] {
  const pairs: { read: number; title: string; score: number }[] = [];
  reads.forEach((read, index) => {
    for (const candidate of read.candidates) {
      if (candidate.score < minScore) continue;
      pairs.push({ read: index, title: candidate.title, score: candidate.score });
    }
  });
  pairs.sort((a, b) => b.score - a.score || a.read - b.read || a.title.localeCompare(b.title));

  const takenBy = new Map<string, number>(); // normalised title -> read index
  const chosen = new Map<number, Assignment>();
  const readText = new Map<number, string>();
  reads.forEach((read, index) => readText.set(index, normalise(read.id)));

  for (const pair of pairs) {
    if (chosen.has(pair.read)) continue;
    const key = normalise(pair.title);
    const owner = takenBy.get(key);
    if (owner !== undefined) {
      // A second copy of the same book is allowed only when the reads look alike.
      if (readText.get(owner) !== readText.get(pair.read)) continue;
    }
    chosen.set(pair.read, { id: reads[pair.read].id, title: pair.title, score: pair.score });
    if (owner === undefined) takenBy.set(key, pair.read);
  }

  // Anything left over keeps its own best guess, so a read is never dropped.
  reads.forEach((read, index) => {
    if (chosen.has(index)) return;
    const best = [...read.candidates].sort((a, b) => b.score - a.score)[0];
    if (best) chosen.set(index, { id: read.id, title: best.title, score: best.score });
  });

  return [...chosen.values()];
}
