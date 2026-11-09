import type { Stop } from "@/lib/types";

/**
 * Denver regions, from the city directory brief.
 *
 * The OSM extract carries suburb names too (Aurora, Lakewood, Westminster…), and those
 * are outside the City and County of Denver the directory describes. Keeping them in a
 * separate "metro" region means the route planner can stay inside the city by default
 * instead of sending someone to Golden for a book box.
 */
export type Region = {
  id: string;
  name: string;
  blurb: string;
  neighborhoods: string[];
  /** Named anchors the city directory lists for this section. */
  featured: string[];
  denver: boolean;
};

export const REGIONS: Region[] = [
  {
    id: "central",
    name: "Central & historic",
    blurb: "The densest corridor. Book boxes built into front-yard fences and garden walls.",
    neighborhoods: ["capitol hill", "cheesman park", "cheeseman park", "congress park", "uptown", "city park", "city park west", "country club", "alamo placita", "speer", "whittier", "five points", "baker"],
    featured: ["360 Franklin St", "Nancy's Book Nook · 12th & Corona", "Little Free Library #19509 · 2351 N Ogden"],
    denver: true,
  },
  {
    id: "northwest",
    name: "Northwest & west",
    blurb: "Pedestrian traffic along W 32nd, W 38th, and the Santa Fe art district.",
    neighborhoods: ["highland", "west highland", "sunnyside", "berkeley", "jefferson park", "lincoln park", "la alma", "chaffee park", "west colfax"],
    featured: ["Lipan St. Little Free Library · 1435 Lipan", "Seventh Circle Community Fridge · 2935 W 7th"],
    denver: true,
  },
  {
    id: "southeast",
    name: "South & southeast",
    blurb: "Suburban-urban walking grid with active neighborhood associations.",
    neighborhoods: ["washington park", "platt park", "rosedale", "university", "cory-merrill", "observatory park", "university hills", "virginia village"],
    featured: ["Williams Little Free Library · 1838 S Williams", "Platt Park Little Free Pantry · 1601 S Clarkson"],
    denver: true,
  },
  {
    id: "northeast",
    name: "East & northeast",
    blurb: "Planned communities woven into greenways, pocket parks, and trail loops.",
    neighborhoods: ["park hill", "lowry", "central park", "stapleton", "montbello", "green valley ranch", "gateway", "northeast park hill"],
    featured: ["Lowry Little Free Library Trail", "Park Hill grid · 16th–26th between York and Quebec"],
    denver: true,
  },
  {
    id: "southwest",
    name: "Southwest",
    blurb: "Gathering spots, school zones, and mutual-aid hubs rather than lawn boxes.",
    neighborhoods: ["westwood", "mar lee", "harvey park", "athmar park", "valverde", "barnum", "ruby hill"],
    featured: ["Denver Dream Center Pantry · 2758 Welton", "Re:Vision Community Hub · 3800 Morrison"],
    denver: true,
  },
  {
    id: "metro",
    name: "Denver metro",
    blurb: "Outside the city and county line. Not part of the directory, kept out of the default loop.",
    neighborhoods: ["aurora", "lakewood", "westminster", "golden", "edgewater", "wheat ridge", "denver metro", "thornton", "arvada", "littleton", "englewood", "commerce city", "northglenn", "centennial", "greenwood village"],
    featured: [],
    denver: false,
  },
];

const LOOKUP = new Map<string, Region>();
for (const region of REGIONS) {
  for (const neighborhood of region.neighborhoods) LOOKUP.set(neighborhood, region);
}

export function regionOf(neighborhood: string): Region | undefined {
  const key = neighborhood.trim().toLowerCase();
  return LOOKUP.get(key);
}

export function regionIdOf(neighborhood: string): string {
  return regionOf(neighborhood)?.id ?? "other";
}

/** Stops inside the City and County of Denver — what the loop planner should use. */
export function denverStops(stops: Stop[]): Stop[] {
  return stops.filter((stop) => regionOf(stop.neighborhood)?.denver !== false);
}

export function stopsInRegion(stops: Stop[], regionId: string): Stop[] {
  if (regionId === "all") return stops;
  return stops.filter((stop) => regionIdOf(stop.neighborhood) === regionId);
}

/** Bounding box of a stop list, for framing the map on a section. */
export function boundsOf(stops: Stop[]): { south: number; west: number; north: number; east: number } | null {
  if (!stops.length) return null;
  let south = stops[0].lat;
  let north = stops[0].lat;
  let west = stops[0].lon;
  let east = stops[0].lon;
  for (const stop of stops) {
    if (stop.lat < south) south = stop.lat;
    if (stop.lat > north) north = stop.lat;
    if (stop.lon < west) west = stop.lon;
    if (stop.lon > east) east = stop.lon;
  }
  // A single pin still needs a box to fit to.
  const pad = 0.004;
  return { south: south - pad, west: west - pad, north: north + pad, east: east + pad };
}

/** Counts per region, for the filter chips. */
export function regionCounts(stops: Stop[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const stop of stops) {
    const id = regionIdOf(stop.neighborhood);
    counts[id] = (counts[id] ?? 0) + 1;
  }
  return counts;
}
