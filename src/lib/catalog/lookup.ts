import { demandByIsbn } from "@/lib/agents/rag";

/**
 * On-device-first book lookup.
 *
 * Order: bundled demand catalog → local cache → Open Library (direct from the browser,
 * which sends CORS headers) → give up quietly. Nothing here needs a server function, so
 * a scanned ISBN still resolves with no Vercel invocation and no network at all if the
 * book is in the catalog or was looked up before.
 */
export type BookLookup = {
  isbn: string;
  title: string;
  author: string;
  subjects: string[];
  found: boolean;
  source: "on-device" | "cache" | "openlibrary" | "none";
};

const CACHE_KEY = "spine-route.isbn.v1";
const TIMEOUT_MS = 6000;

type Cached = Omit<BookLookup, "source">;

function readCache(): Record<string, Cached> {
  if (typeof localStorage === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY) ?? "{}") as Record<string, Cached>;
  } catch {
    return {};
  }
}

function writeCache(isbn: string, value: Cached): void {
  if (typeof localStorage === "undefined") return;
  try {
    const cache = readCache();
    cache[isbn] = value;
    const entries = Object.entries(cache).slice(-200);
    localStorage.setItem(CACHE_KEY, JSON.stringify(Object.fromEntries(entries)));
  } catch {
    /* storage full or blocked — the catalog still answers */
  }
}

function fromCatalog(isbn: string): BookLookup | null {
  const known = demandByIsbn(isbn);
  if (!known) return null;
  return {
    isbn,
    title: known.title,
    author: known.author,
    subjects: [known.subject],
    found: true,
    source: "on-device",
  };
}

async function fromOpenLibrary(isbn: string): Promise<BookLookup | null> {
  if (typeof fetch === "undefined") return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(
      `https://openlibrary.org/api/books?bibkeys=ISBN:${isbn}&format=json&jscmd=data`,
      { signal: controller.signal, headers: { accept: "application/json" } },
    );
    if (!response.ok) return null;
    const payload = (await response.json()) as Record<
      string,
      { title?: string; authors?: { name: string }[]; subjects?: { name: string }[] }
    >;
    const hit = payload[`ISBN:${isbn}`];
    if (!hit) return null;
    const value: Cached = {
      isbn,
      title: hit.title ?? "",
      author: hit.authors?.[0]?.name ?? "",
      subjects: (hit.subjects ?? []).map((subject) => subject.name).slice(0, 8),
      found: true,
    };
    writeCache(isbn, value);
    return { ...value, source: "openlibrary" };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function lookupBook(isbn: string, opts: { offline?: boolean } = {}): Promise<BookLookup> {
  const local = fromCatalog(isbn);
  if (local) return local;

  const cached = readCache()[isbn];
  if (cached) return { ...cached, source: "cache" };

  if (!opts.offline) {
    const remote = await fromOpenLibrary(isbn);
    if (remote) return remote;
  }

  return { isbn, title: "", author: "", subjects: [], found: false, source: "none" };
}

/** True when the browser is offline, so the scan UI can skip the network attempt. */
export function isOffline(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}
