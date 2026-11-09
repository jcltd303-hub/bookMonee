/**
 * Is this OCR output actually words?
 *
 * Tesseract's confidence score says how sure it is about its own segmentation, not
 * whether the result is language. Measured on synthetic spines, vertical text fed in
 * unrotated scored 62–70 confidence while producing `>[as J u = LL Z C [S z < @`.
 * A gate that only checks `confidence >= 30` accepts that and prices it as a book.
 *
 * So the gate looks at the text instead: letter/symbol balance, vowel distribution,
 * word shape, and how much of it hits a known vocabulary. Pure functions, no imports,
 * so the browser and the Node benchmark score identically.
 */
export type Plausibility = {
  score: number;
  /** True when the text is worth showing as a book. */
  plausible: boolean;
  letters: number;
  symbols: number;
  /** Share of tokens that are a single character — noise reads full of these. */
  singleLetterRatio: number;
  /** Share of tokens found in the vocabulary. */
  knownRatio: number;
  reason: string;
};

/** The most common words in English spines and blurbs. Deliberately small. */
const COMMON_WORDS = new Set(
  `the of and to in a is for on with as by at from an or be this that it its his her their your my our
  new old book books novel story guide manual edition volume vol part series history world life love war
  death time night day house home city girl boy man woman children child school university press
  introduction principles fundamentals essential complete practical modern basic advanced study
  science history physics chemistry biology mathematics economics business law medicine art music
  cookbook dictionary encyclopedia atlas poems poetry essays letters journal diary memoir
  best selling international award winning illustrated revised updated second third fourth fifth
  great little big small dark light lost secret hidden true false last first next other another
  power water fire earth sea ocean mountain river forest garden road bridge island
  game games hunger catcher rye pride prejudice moon wild things harry potter stone chamber
  anatomy physiology pathology pharmacology nursing medical surgical finance accounting
  calculus algebra geometry statistics algorithm algorithms networking operating system concepts
  mechanics statics dynamics engineering computer programming language design analysis`
    .split(/\s+/)
    .filter(Boolean),
);

const SYMBOL = /[<>{}\[\]|\\/@#$%^*_~`©®™±°§¶•]/g;
const VOWELS = new Set(["a", "e", "i", "o", "u", "y"]);

function clamp(value: number, min = 0, max = 1): number {
  return Math.max(min, Math.min(max, value));
}

/** Tokens of two or more characters, lowercased. */
function words(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9']+/)
    .filter(Boolean);
}

/**
 * Score one OCR read. `vocabulary` is an optional extra word set — the app passes the
 * catalog's own tokens, so a spine that matches a known title scores higher.
 */
export function assess(text: string, vocabulary?: Set<string>): Plausibility {
  const trimmed = text.trim();
  const letters = (trimmed.match(/[A-Za-z]/g) ?? []).length;
  const symbols = (trimmed.match(SYMBOL) ?? []).length;
  const tokens = words(trimmed);
  const singleLetters = tokens.filter((token) => token.length === 1).length;
  const singleLetterRatio = tokens.length ? singleLetters / tokens.length : 1;

  if (!letters || !tokens.length) {
    return {
      score: 0,
      plausible: false,
      letters,
      symbols,
      singleLetterRatio,
      knownRatio: 0,
      reason: "no letters",
    };
  }

  const visible = trimmed.replace(/\s+/g, "").length;
  const alphaRatio = letters / Math.max(1, visible);
  const symbolRatio = symbols / Math.max(1, visible);
  const vowelRatio = (trimmed.toLowerCase().match(/[aeiouy]/g) ?? []).length / letters;
  const avgTokenLength = tokens.reduce((sum, token) => sum + token.length, 0) / tokens.length;
  const known = tokens.filter((token) => COMMON_WORDS.has(token) || vocabulary?.has(token)).length;
  const knownRatio = known / tokens.length;

  // English runs about 0.3–0.5 vowels per letter; nonsense clusters at the ends.
  const vowelScore = vowelRatio < 0.15 ? vowelRatio / 0.15 : vowelRatio > 0.7 ? clamp((1 - vowelRatio) / 0.3) : 1;
  const wordShape = avgTokenLength < 2.5 ? avgTokenLength / 2.5 : avgTokenLength > 12 ? clamp((20 - avgTokenLength) / 8) : 1;

  const shape =
    0.3 * clamp(alphaRatio) +
    0.25 * (1 - clamp(symbolRatio * 2)) +
    0.2 * vowelScore +
    0.15 * wordShape +
    0.1 * (1 - clamp(singleLetterRatio));

  const score = Math.round((0.75 * shape + 0.25 * clamp(knownRatio)) * 1000) / 1000;
  // A title needs at least one real word in it. Without this, greyscale preprocessing
  // handed back "ad a &" at 0.74 — short, letter-heavy, and not a book.
  const longestWord = tokens.reduce((longest, token) => Math.max(longest, token.length), 0);
  const plausible =
    score >= 0.55 && letters >= 6 && singleLetterRatio <= 0.4 && longestWord >= 4;

  return {
    score,
    plausible,
    letters,
    symbols,
    singleLetterRatio: Math.round(singleLetterRatio * 100) / 100,
    knownRatio: Math.round(knownRatio * 100) / 100,
    reason: plausible
      ? knownRatio > 0
        ? "known words"
        : "word-shaped"
      : letters < 6
        ? "too little text"
        : longestWord < 4
          ? "no word long enough"
          : singleLetterRatio > 0.4
            ? "mostly single letters"
            : symbolRatio > 0.25
              ? "mostly symbols"
              : vowelScore < 0.5
                ? "no vowel structure"
                : "below threshold",
  };
}

/** Convenience wrapper for call sites that only need the verdict. */
export function isPlausible(text: string, vocabulary?: Set<string>): boolean {
  return assess(text, vocabulary).plausible;
}
