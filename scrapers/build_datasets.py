#!/usr/bin/env python3
"""Build dataset #1 (stops) and dataset #2 (buyback priors).

Sources are separate so a later charter export or a live Overpass pull
can be dropped in without touching the app.

  python3 scrapers/build_datasets.py

Reads scrapers/cache/bbbike-denver-kept.json (OSM nodes kept by
parse_osm_stream.py). Writes src/data/libraries.json and src/data/books.json.
"""
from __future__ import annotations

import hashlib
import json
import math
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CACHE = Path(__file__).resolve().parent / "cache" / "bbbike-denver-kept.json"
LIB_OUT = ROOT / "src" / "data" / "libraries.json"
BOOK_OUT = ROOT / "src" / "data" / "books.json"

# Directory anchors from the Denver micro-exchange guide (geocoded).
ANCHORS = [
    {
        "name": "Little Free Library",
        "address": "360 Franklin St, Denver, CO 80218",
        "lat": 39.7214764,
        "lon": -104.9675877,
        "kind": "bookcase",
        "notes": "Directory anchor. Alamo Placita / Country Club.",
    },
    {
        "name": "Nancy's Book Nook",
        "address": "12th Ave & Corona St, Denver, CO 80218",
        "lat": 39.7349368,
        "lon": -104.9742065,
        "kind": "bookcase",
        "notes": "Directory anchor. Capitol Hill corner box.",
    },
    {
        "name": "Little Free Library #19509",
        "address": "2351 Ogden St, Denver, CO 80205",
        "lat": 39.7516835,
        "lon": -104.9748659,
        "kind": "bookcase",
        "charter": "19509",
        "notes": "Directory anchor. Five Points / Whittier. Charter #19509.",
    },
    {
        "name": "Lipan St Little Free Library",
        "address": "1435 Lipan St, Denver, CO 80204",
        "lat": 39.7391580,
        "lon": -105.0018269,
        "kind": "bookcase",
        "notes": "Directory anchor. Lincoln Park / Santa Fe.",
    },
    {
        "name": "Williams Little Free Library",
        "address": "1838 S Williams St, Denver, CO 80210",
        "lat": 39.6831796,
        "lon": -104.9661359,
        "kind": "bookcase",
        "notes": "Directory anchor. University / DU corridor.",
    },
    {
        "name": "Platt Park Little Free Pantry",
        "address": "1601 S Clarkson St, Denver, CO 80210",
        "lat": 39.6872569,
        "lon": -104.9784349,
        "kind": "pantry",
        "notes": "Mutual-aid pantry. Not a book-buyback stop.",
    },
    {
        "name": "Seventh Circle Community Fridge",
        "address": "2935 W 7th Ave, Denver, CO 80204",
        "lat": 39.7277364,
        "lon": -105.0241089,
        "kind": "fridge",
        "notes": "24/7 mutual-aid fridge. Not a supply run.",
    },
    {
        "name": "Denver Dream Center Pantry",
        "address": "2758 Welton St, Denver, CO 80205",
        "lat": 39.7554367,
        "lon": -104.9768157,
        "kind": "pantry",
        "notes": "Five Points community hub. Mutual aid, not inventory.",
    },
    {
        "name": "Re:Vision Community Hub",
        "address": "3800 Morrison Rd, Denver, CO 80219",
        "lat": 39.7076625,
        "lon": -105.0373908,
        "kind": "fridge",
        "notes": "Westwood community fridge. Mutual aid, not inventory.",
    },
]

NEIGHBORHOODS = [
    ("Capitol Hill", 39.733, -104.979),
    ("Cheesman Park", 39.733, -104.966),
    ("City Park", 39.747, -104.950),
    ("Congress Park", 39.735, -104.956),
    ("Uptown", 39.743, -104.978),
    ("Five Points", 39.754, -104.982),
    ("Whittier", 39.752, -104.968),
    ("Park Hill", 39.755, -104.922),
    ("Central Park", 39.771, -104.888),
    ("Lowry", 39.720, -104.890),
    ("Highland", 39.762, -105.011),
    ("West Highland", 39.764, -105.040),
    ("Sunnyside", 39.776, -105.011),
    ("Berkeley", 39.776, -105.040),
    ("Sloan Lake", 39.748, -105.044),
    ("Jefferson Park", 39.751, -105.020),
    ("Lincoln Park", 39.734, -105.004),
    ("Baker", 39.720, -104.995),
    ("Speer", 39.722, -104.986),
    ("Cherry Creek", 39.717, -104.953),
    ("Washington Park", 39.700, -104.971),
    ("Platt Park", 39.689, -104.980),
    ("University", 39.672, -104.960),
    ("Rosedale", 39.666, -104.980),
    ("Westwood", 39.706, -105.038),
    ("Athmar Park", 39.704, -105.010),
    ("Barnum", 39.718, -105.033),
    ("Harvey Park", 39.655, -105.041),
    ("Marston", 39.648, -105.090),
    ("Wheat Ridge", 39.766, -105.077),
    ("Lakewood", 39.705, -105.102),
    ("Edgewater", 39.753, -105.064),
    ("Englewood", 39.647, -104.987),
    ("Aurora", 39.712, -104.832),
    ("Arvada", 39.816, -105.088),
    ("Westminster", 39.837, -105.037),
    ("Golden", 39.755, -105.221),
]

# Buyback priors. Dollars are category estimates, not live vendor quotes.
# ISBN comes from Open Library search so the identifier is a real edition
# on that work — confirm the edition on the spine before you trust the band.
BOOK_QUERIES = [
    ("Organic Chemistry Klein", "chemistry", 78, 30, 160, "textbook"),
    ("Gray's Anatomy for Students Drake", "medicine", 70, 25, 140, "textbook"),
    ("Campbell Biology Urry", "biology", 62, 18, 120, "textbook"),
    ("Pharmacotherapy Dipiro", "pharmacy", 58, 15, 130, "textbook"),
    ("Intermediate Accounting Kieso", "accounting", 54, 12, 110, "textbook"),
    ("Guyton and Hall Textbook of Medical Physiology", "medicine", 50, 12, 100, "textbook"),
    ("Robbins Basic Pathology", "medicine", 48, 10, 95, "textbook"),
    ("Saunders Comprehensive Review NCLEX Silvestri", "nursing", 44, 8, 80, "textbook"),
    ("Lehninger Principles of Biochemistry", "biology", 40, 8, 85, "textbook"),
    ("Corporate Finance Ross Westerfield", "finance", 36, 6, 70, "textbook"),
    ("Campbell Biology in Focus", "biology", 34, 6, 70, "textbook"),
    ("Fundamentals of Physics Halliday", "physics", 32, 5, 65, "textbook"),
    ("University Physics Young Freedman", "physics", 30, 5, 60, "textbook"),
    ("Principles of Economics Mankiw", "economics", 28, 4, 55, "textbook"),
    ("Computer Networking Kurose", "computer science", 26, 4, 55, "textbook"),
    ("Introduction to Algorithms Cormen", "computer science", 24, 4, 50, "textbook"),
    ("Calculus Stewart", "mathematics", 22, 3, 48, "textbook"),
    ("Operating System Concepts Silberschatz", "computer science", 20, 3, 40, "textbook"),
    ("Linear Algebra Lay", "mathematics", 16, 2, 35, "textbook"),
    ("Engineering Mechanics Statics Hibbeler", "engineering", 18, 2, 40, "textbook"),
    ("Discrete Mathematics Rosen", "mathematics", 14, 2, 30, "textbook"),
    ("Medical-Surgical Nursing Lewis", "nursing", 15, 2, 36, "textbook"),
    ("The Hunger Games Collins", "fiction", 1.5, 0, 4, "trade"),
    ("Harry Potter and the Sorcerer's Stone", "fiction", 1.2, 0, 6, "trade"),
    ("Pride and Prejudice Austen", "fiction", 0.8, 0, 3, "trade"),
    ("The Catcher in the Rye Salinger", "fiction", 0.7, 0, 3, "trade"),
    ("Where the Wild Things Are", "children", 0.5, 0, 2, "trade"),
    ("Goodnight Moon", "children", 0.4, 0, 2, "trade"),
]


def miles(a_lat: float, a_lon: float, b_lat: float, b_lon: float) -> float:
    r = 3958.8
    p = math.pi / 180
    dlat = (b_lat - a_lat) * p
    dlon = (b_lon - a_lon) * p
    s = math.sin(dlat / 2) ** 2 + math.cos(a_lat * p) * math.cos(b_lat * p) * math.sin(dlon / 2) ** 2
    return 2 * r * math.asin(min(1, math.sqrt(s)))


def neighborhood(lat: float, lon: float) -> str:
    best = "Denver metro"
    best_d = 99.0
    for name, nlat, nlon in NEIGHBORHOODS:
        d = miles(lat, lon, nlat, nlon)
        if d < best_d:
            best, best_d = name, d
    return best if best_d < 2.4 else "Denver metro"


def kind_of(tags: dict) -> str:
    amenity = tags.get("amenity", "")
    blob = " ".join(tags.values()).lower()
    if amenity == "food_sharing" or "fridge" in blob:
        return "fridge" if "fridge" in blob else "pantry"
    if "pantry" in blob and "book" not in blob and "library" not in blob:
        return "pantry"
    if amenity == "public_bookcase" or "library" in blob or "bookcase" in blob:
        return "bookcase"
    return "bookcase"


def address_of(tags: dict) -> str:
    num = tags.get("addr:housenumber", "")
    street = tags.get("addr:street", "")
    city = tags.get("addr:city", "Denver")
    zipc = tags.get("addr:postcode", "")
    line = " ".join(x for x in (num, street) if x)
    tail = ", ".join(x for x in (city, "CO", zipc) if x)
    if line:
        return f"{line}, {tail}" if tail else line
    return ""


def load_osm() -> list[dict]:
    raw = json.loads(CACHE.read_text())
    items = raw["kept"] if isinstance(raw, dict) else raw
    stops = []
    for node in items:
        tags = node.get("tags") or {}
        kind = kind_of(tags)
        ref = tags.get("ref") or ""
        charter = ref if ref.isdigit() else ""
        stops.append(
            {
                "id": f"osm-{node['id']}",
                "name": tags.get("name") or ("Little Free Library" if kind == "bookcase" else "Mutual-aid stop"),
                "kind": kind,
                "lat": node["lat"],
                "lon": node["lon"],
                "address": address_of(tags),
                "neighborhood": neighborhood(node["lat"], node["lon"]),
                "charter": charter,
                "notes": tags.get("description") or tags.get("note") or "",
                "access": tags.get("opening_hours") or "unknown",
                "profitEligible": kind == "bookcase",
                "source": "openstreetmap",
                "sourceId": str(node["id"]),
                "sourceUrl": f"https://www.openstreetmap.org/node/{node['id']}",
                "extract": "BBBike Denver OSM XML, snapshot 2026-11-01",
            }
        )
    return stops


def merge_anchors(stops: list[dict]) -> list[dict]:
    for anchor in ANCHORS:
        if any(miles(anchor["lat"], anchor["lon"], s["lat"], s["lon"]) < 0.05 for s in stops):
            # 0.05 miles ~ 80m. Keep the OSM pin; annotate if the anchor has a charter.
            if anchor.get("charter"):
                for s in stops:
                    if miles(anchor["lat"], anchor["lon"], s["lat"], s["lon"]) < 0.05 and not s.get("charter"):
                        s["charter"] = anchor["charter"]
                        if anchor["name"] not in (s.get("notes") or ""):
                            s["notes"] = (s.get("notes") + " " + anchor["notes"]).strip()
                        break
            continue
        stops.append(
            {
                "id": "anchor-" + hashlib.sha1(anchor["address"].encode()).hexdigest()[:10],
                "name": anchor["name"],
                "kind": anchor["kind"],
                "lat": anchor["lat"],
                "lon": anchor["lon"],
                "address": anchor["address"],
                "neighborhood": neighborhood(anchor["lat"], anchor["lon"]),
                "charter": anchor.get("charter", ""),
                "notes": anchor.get("notes", ""),
                "access": "24/7" if anchor["kind"] != "pantry" else "unknown",
                "profitEligible": anchor["kind"] == "bookcase",
                "source": "directory",
                "sourceId": "",
                "sourceUrl": "",
                "extract": "Denver micro-exchange guide, geocoded 2026-11-07",
            }
        )
    stops.sort(key=lambda s: (s["kind"] != "bookcase", s["neighborhood"], s["name"]))
    return stops


def ol_isbn(query: str) -> tuple[str, str, str]:
    url = "https://openlibrary.org/search.json?" + urllib.parse.urlencode(
        {"q": query, "limit": 1, "fields": "title,author_name,isbn"}
    )
    req = urllib.request.Request(url, headers={"User-Agent": "SpineRoute/1.0 (dataset build)"})
    with urllib.request.urlopen(req, timeout=30) as res:
        data = json.loads(res.read().decode())
    docs = data.get("docs") or []
    if not docs:
        return "", query, ""
    doc = docs[0]
    isbns = doc.get("isbn") or []
    isbn13 = next(
        (i for i in isbns if len(i) == 13 and (i.startswith("9780") or i.startswith("9781"))),
        "",
    )
    if not isbn13:
        isbn13 = next((i for i in isbns if len(i) == 13 and i.startswith("978")), "")
    author = (doc.get("author_name") or [""])[0]
    return isbn13, doc.get("title") or query, author


def build_books() -> list[dict]:
    books = []
    seen = set()
    for query, subject, expected, low, high, lane in BOOK_QUERIES:
        try:
            isbn, title, author = ol_isbn(query)
        except Exception as exc:  # noqa: BLE001
            print("ol fail", query, exc)
            continue
        if not isbn or isbn in seen:
            print("skip", query, isbn)
            continue
        seen.add(isbn)
        check = (
            ["booksrun", "valore", "textbookrush", "worldofbooks", "topdollar"]
            if lane == "textbook"
            else ["worldofbooks", "topdollar", "booksrun"]
        )
        books.append(
            {
                "isbn13": isbn,
                "title": title,
                "author": author,
                "subject": subject,
                "lane": lane,
                "expectedUsd": expected,
                "lowUsd": low,
                "highUsd": high,
                "checkOrder": check,
                "confidence": "low",
                "asOf": "2026-11-07",
                "method": "category-prior",
                "note": "Category prior, not a live quote. Edition on the spine may differ from this Open Library ISBN. Confirm on a vetted buyer before you take it.",
            }
        )
    books.sort(key=lambda b: -b["expectedUsd"])
    for i, book in enumerate(books, start=1):
        book["rank"] = i
    return books


def main() -> None:
    stops = merge_anchors(load_osm())
    books = build_books()
    bookcases = sum(1 for s in stops if s["kind"] == "bookcase")
    mutual = len(stops) - bookcases
    libraries = {
        "meta": {
            "name": "Denver micro-exchange master map",
            "definitive": False,
            "asOf": "2026-11-07",
            "bookcases": bookcases,
            "mutualAid": mutual,
            "bbox": {
                "south": 39.6,
                "west": -105.195,
                "north": 39.89,
                "east": -104.765,
                "label": "BBBike Denver extract, 2026-11-01",
            },
            "whyNotDefinitive": [
                "Little Free Library's charter map is the closest thing to a registry and it is not a public bulk download.",
                "OpenStreetMap only includes boxes someone mapped. Many chartered front-yard libraries are missing.",
                "The BBBike Denver extract clips far northeast Denver (Montbello, Gateway, Green Valley Ranch) and a southern sliver.",
                "Stewards move and retire boxes. A pin can be wrong by the time you arrive.",
            ],
            "osmCredit": "© OpenStreetMap contributors, ODbL",
            "refresh": "python3 scrapers/parse_osm_stream.py < denver.osm.xml | python3 scrapers/build_datasets.py",
        },
        "stops": stops,
    }
    book_doc = {
        "meta": {
            "name": "Buyback demand priors",
            "asOf": "2026-11-07",
            "definitivePrices": False,
            "note": "Live BookScouter and vendor quote pages block automated collection. Ranks use category priors. Logged payouts replace the prior for that ISBN.",
        },
        "books": books,
    }
    LIB_OUT.parent.mkdir(parents=True, exist_ok=True)
    LIB_OUT.write_text(json.dumps(libraries, indent=2) + "\n")
    BOOK_OUT.write_text(json.dumps(book_doc, indent=2) + "\n")
    print(f"stops {len(stops)} bookcases {bookcases} mutual {mutual} books {len(books)}")


if __name__ == "__main__":
    main()
