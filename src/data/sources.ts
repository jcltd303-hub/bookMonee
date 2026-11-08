/** Provenance for the Denver directory, so the map never looks like a census. */
export type SourceLine = { name: string; url: string; note: string };

export const directorySources: SourceLine[] = [
  {
    name: "Little Free Library World Registry",
    url: "https://littlefreelibrary.org/map/",
    note: "Chartered installations across Denver ZIPs 80202–80249.",
  },
  {
    name: "Little Free Pantry Mapping Project",
    url: "https://mapping.littlefreepantry.org/",
    note: "Grassroots mini-pantries for food and essential goods.",
  },
  {
    name: "Denver Community Fridges Network",
    url: "https://denvercommunityfridges.com/locations/",
    note: "24/7 mutual-aid food sharing.",
  },
  {
    name: "Neighborhood trail registries",
    url: "https://littlefreelibrary.org/map/",
    note: "HOA and association trail maps, e.g. the Lowry Little Free Library Trail.",
  },
  {
    name: "OpenStreetMap extract",
    url: "https://www.openstreetmap.org/copyright",
    note: "Street-level pins and addresses, ODbL. Boxes move; stewards are not notified.",
  },
];

/** Anchors named in the city brief that are worth pinning by hand. */
export const briefAnchors = [
  { name: "Nancy's Book Nook", address: "12th Ave & Corona St, Denver, CO 80218", note: "Walk-up Capitol Hill corner box." },
  { name: "Little Free Library #19509", address: "2351 N Ogden St, Denver, CO 80205", note: "Charter #19509, Whittier." },
  { name: "Lipan St. Little Free Library", address: "1435 Lipan St, Denver, CO 80204", note: "Lincoln Park / Santa Fe arts." },
  { name: "Williams Little Free Library", address: "1838 S Williams St, Denver, CO 80210", note: "DU campus / Cory-Merrill." },
  { name: "Seventh Circle Community Fridge", address: "2935 W 7th Ave, Denver, CO 80204", note: "24/7 mutual aid fridge and pantry." },
];
