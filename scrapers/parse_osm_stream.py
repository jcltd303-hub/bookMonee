#!/usr/bin/env python3
"""Stream OSM XML on stdin and emit micro-exchange nodes as JSON."""
import json
import re
import sys

node_re = re.compile(r'<node id="(\d+)"[^>]* lat="([0-9.\-]+)" lon="([0-9.\-]+)"')
tag_re = re.compile(r'<tag k="([^"]*)" v="([^"]*)"')
interesting = {
    "amenity",
    "name",
    "description",
    "brand",
    "public_bookcase:type",
    "operator",
    "addr:street",
    "addr:housenumber",
    "addr:city",
    "addr:postcode",
    "opening_hours",
    "note",
    "ref",
    "access",
    "capacity",
    "website",
    "little_free_library",
    "brand:wikidata",
    "social_facility",
    "social_facility:for",
}
want_amenity = {"public_bookcase", "give_box", "food_sharing"}


def unescape(value: str) -> str:
    return (
        value.replace("&", "&")
        .replace("'", "'")
        .replace(chr(38) + "quot;", '"')
        .replace("<", "<")
        .replace(">", ">")
    )


def interesting_text(tags: dict) -> bool:
    blob = " ".join(tags.values()).lower()
    amenity = tags.get("amenity", "")
    if amenity in want_amenity:
        return True
    needles = (
        "little free",
        "public bookcase",
        "community fridge",
        "little pantry",
        "free pantry",
        "free little library",
    )
    return any(n in blob for n in needles)


def main() -> None:
    kept = []
    nodes = 0
    cur = None
    for line in sys.stdin:
        if "<node " in line:
            match = node_re.search(line)
            if not match or "/>" in line:
                cur = None
                continue
            nodes += 1
            cur = {
                "id": match.group(1),
                "lat": float(match.group(2)),
                "lon": float(match.group(3)),
                "tags": {},
            }
            continue
        if cur is None:
            continue
        if "<tag " in line:
            tag = tag_re.search(line)
            if tag and tag.group(1) in interesting:
                cur["tags"][tag.group(1)] = unescape(tag.group(2))
            continue
        if "</node>" in line:
            if interesting_text(cur["tags"]):
                kept.append(cur)
            cur = None
    json.dump({"nodes_seen": nodes, "kept": kept}, sys.stdout)
    print(f"\nnodes {nodes} kept {len(kept)}", file=sys.stderr)


if __name__ == "__main__":
    main()
