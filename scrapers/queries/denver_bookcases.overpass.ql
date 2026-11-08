// Denver metro micro-exchanges.
// Run against any Overpass instance when one is reachable:
//   curl -X POST https://overpass-api.de/api/interpreter --data-urlencode data@denver_bookcases.overpass.ql
// The BBBike Denver OSM XML extract is the fallback (see build_datasets.py).
[out:json][timeout:90];
(
  nwr["amenity"="public_bookcase"](39.55,-105.25,40.02,-104.55);
  nwr["public_bookcase:type"](39.55,-105.25,40.02,-104.55);
  nwr["brand"="Little Free Library"](39.55,-105.25,40.02,-104.55);
  nwr["amenity"="food_sharing"](39.55,-105.25,40.02,-104.55);
  nwr["name"~"[Ll]ittle [Ff]ree ([Ll]ibrary|[Pp]antry)|[Cc]ommunity [Ff]ridge"](39.55,-105.25,40.02,-104.55);
);
out center tags;
