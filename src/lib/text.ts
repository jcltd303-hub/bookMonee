/**
 * Small text fixes for imported data.
 *
 * The OpenStreetMap import keeps whatever the mapper typed, which for a couple of
 * Denver book boxes includes HTML entities: `Nancy&apos;s book nook` renders literally
 * in the route list. Decoding at load keeps the source data untouched and the UI clean.
 */
const NAMED: Record<string, string> = {
  "&apos;": "'",
  "&#39;": "'",
  "&quot;": '"',
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&nbsp;": " ",
};

export function decodeEntities(text: string): string {
  if (!text.includes("&")) return text;
  return text
    .replace(/&(?:apos|quot|amp|lt|gt|nbsp);|&#\d+;/g, (entity) => {
      if (entity in NAMED) return NAMED[entity];
      const code = Number(entity.slice(2, -1));
      return Number.isFinite(code) ? String.fromCodePoint(code) : entity;
    })
    .replace(/\s+/g, " ")
    .trim();
}
