/**
 * Replacement stock and directory portals — bundled, not fetched.
 *
 * These used to come back from a server function that pulled RSS feeds. Feeds are not
 * CORS-readable from a browser, so the honest on-device version ships the standing
 * sources and links out to the boards that block programmatic pulls. No function
 * invocation, works offline, nothing to keep alive on Vercel.
 */
export type Deal = {
  title: string;
  url: string;
  source: string;
  note: string;
  kind: "replacement" | "map" | "board";
};

export const standingDeals: Deal[] = [
  {
    title: "BookGive Denver",
    url: "https://littlefreelibrary.org/book-resource/request-books-in-denver/",
    source: "Little Free Library",
    note: "Free replacement stock for Denver boxes. This is how you put a book back.",
    kind: "replacement",
  },
  {
    title: "Official charter map",
    url: "https://littlefreelibrary.org/map/",
    source: "Little Free Library",
    note: "Search Denver, CO or ZIPs 80202–80249. Chartered boxes that were never mapped on OpenStreetMap live here.",
    kind: "map",
  },
  {
    title: "Little Free Pantry map",
    url: "https://mapping.littlefreepantry.org/",
    source: "Little Free Pantry",
    note: "Grassroots food and essential-goods boxes. Mutual aid, not a stop the route agent will spend.",
    kind: "map",
  },
  {
    title: "Denver Community Fridges",
    url: "https://denvercommunityfridges.com/locations/",
    source: "Denver Community Fridges",
    note: "Public-access fridges and mutual-aid pantries across the city.",
    kind: "map",
  },
  {
    title: "Denver Craigslist books",
    url: "https://denver.craigslist.org/search/bks",
    source: "Craigslist",
    note: "Their feed blocks a direct pull. Open the board for library sales and bulk cheap paperbacks.",
    kind: "board",
  },
  {
    title: "Compare buyback quotes",
    url: "https://bookscouter.com/",
    source: "BookScouter",
    note: "The comparison board the desk model is calibrated against. Always check a real quote before shipping.",
    kind: "board",
  },
];

export function dealsByKind(kind: Deal["kind"]): Deal[] {
  return standingDeals.filter((deal) => deal.kind === kind);
}
