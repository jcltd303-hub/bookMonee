import { useEffect, useState } from "react";
import { LocateFixed, Navigation } from "lucide-react";
import { bookcases, CIVIC_CENTER, libraries, mutualAid } from "@/lib/catalog";
import { REGIONS, denverStops, regionCounts, stopsInRegion } from "@/data/regions";
import { briefAnchors, directorySources } from "@/data/sources";
import { nearestStops, planRoute } from "@/lib/agents/decide";
import { formatMiles, formatUsd, walkUrl } from "@/lib/geo";
import { useRun } from "@/lib/store";
import type { LatLng } from "@/lib/types";

export function RunTab() {
  const maxStops = useRun((s) => s.maxStops);
  const mileBudget = useRun((s) => s.mileBudget);
  const showMutual = useRun((s) => s.showMutual);
  const route = useRun((s) => s.route);
  const activeStopId = useRun((s) => s.activeStopId);
  const memory = useRun((s) => s.memory);
  const walker = useRun((s) => s.walker);
  const region = useRun((s) => s.region);
  const setRegion = useRun((s) => s.setRegion);
  const setMaxStops = useRun((s) => s.setMaxStops);
  const setMileBudget = useRun((s) => s.setMileBudget);
  const setShowMutual = useRun((s) => s.setShowMutual);
  const setRoute = useRun((s) => s.setRoute);
  const setActiveStopId = useRun((s) => s.setActiveStopId);
  const setStartLabel = useRun((s) => s.setStartLabel);
  const [start, setStart] = useState<LatLng>(CIVIC_CENTER);
  const [label, setLabel] = useState(CIVIC_CENTER.label);
  const [note, setNote] = useState("");
  const [MapView, setMapView] = useState<typeof import("@/components/map-view").MapView | null>(null);

  useEffect(() => {
    void import("@/components/map-view").then((mod) => setMapView(() => mod.MapView));
  }, []);

  const pool = region === "denver" ? denverStops(bookcases) : stopsInRegion(bookcases, region);
  const counts = regionCounts(bookcases);
  const nearest = nearestStops(start, 4, pool);
  const miles = route.reduce((sum, leg) => sum + leg.miles, 0);
  const cash = route.reduce((sum, leg) => sum + Math.max(0, leg.scoreUsd), 0);
  const longHop = (route[0]?.miles ?? nearest[0]?.miles ?? 0) > 12;

  function locate() {
    if (!navigator.geolocation) {
      setNote("This browser has no location. Tap the map to drop a start pin.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setStart({ lat: pos.coords.latitude, lon: pos.coords.longitude });
        setLabel("Your location");
        setNote("");
      },
      () => setNote("Location stayed off. Tap the map, or plan from Civic Center."),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60_000 },
    );
  }

  function plan() {
    const legs = planRoute({ start, maxStops, mileBudget, memory, net: walker, stops: pool });
    setRoute(legs);
    setStartLabel(label);
    setNote(legs.length ? "" : "Nothing cleared the mile budget. Raise the cap or move the start pin.");
  }

  return (
    <div className="grid gap-4">
      <section className="overflow-hidden rounded-xl border border-border bg-surface">
        <div className="h-72">
          {MapView ? (
            <MapView
              start={start}
              route={route}
              boxes={pool}
              mutual={mutualAid}
              showMutual={showMutual}
              activeId={activeStopId}
              onStart={(point) => {
                setStart(point);
                setLabel("Dropped pin");
              }}
              onSelect={setActiveStopId}
            />
          ) : (
            <div className="h-full bg-surface-2" />
          )}
        </div>
        <p className="border-t border-border px-4 py-2 text-sm text-muted">
          Tap the map to move the start. Brass numbers are the loop. Sage dots are book boxes. Gray dots are mutual aid, and they are not stops.
        </p>
      </section>

      <section className="grid gap-2">
        <h2 className="text-xl">Region</h2>
        <div className="flex flex-wrap gap-2">
          {[{ id: "denver", name: "All of Denver" }, ...REGIONS.map((item) => ({ id: item.id, name: item.name }))].map((chip) => (
            <button
              key={chip.id}
              type="button"
              onClick={() => setRegion(chip.id)}
              className={`h-9 rounded-full border px-3 text-sm font-semibold ${region === chip.id ? "border-primary bg-primary text-primary-fg" : "border-border bg-surface text-fg"}`}
            >
              {chip.name}
              <span className="ml-1 tabular-nums opacity-70">{counts[chip.id] ?? 0}</span>
            </button>
          ))}
        </div>
        <p className="text-sm text-muted">
          {region === "denver"
            ? "City and county only. Suburb boxes are one tap away and outside the directory."
            : REGIONS.find((item) => item.id === region)?.blurb ?? "Every mapped box."}
        </p>
      </section>

      <section className="grid gap-3 rounded-xl border border-border bg-surface p-4">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-xl text-fg">Walker</h2>
          <p className="text-sm text-muted tabular-nums">{label}</p>
        </div>
        <p className="text-sm text-muted">
          Picks the next box by expected cash minus a quarter per mile, then a small network corrects that guess after you log what you were actually paid.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <label className="grid gap-1 text-sm">
            <span className="text-muted">Stops</span>
            <input
              className="h-11 accent-primary"
              type="range"
              min={1}
              max={8}
              value={maxStops}
              onChange={(event) => setMaxStops(Number(event.target.value))}
            />
            <span className="tabular-nums text-fg">{maxStops}</span>
          </label>
          <label className="grid gap-1 text-sm">
            <span className="text-muted">Mile cap</span>
            <input
              className="h-11 accent-primary"
              type="range"
              min={1}
              max={25}
              value={mileBudget}
              onChange={(event) => setMileBudget(Number(event.target.value))}
            />
            <span className="tabular-nums text-fg">{mileBudget} mi</span>
          </label>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={showMutual}
            onChange={(event) => setShowMutual(event.target.checked)}
            className="size-5 accent-primary"
          />
          Show pantries and fridges
        </label>
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={locate} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-border bg-surface-2 px-3 text-sm font-semibold text-fg">
            <LocateFixed className="size-4" />
            Use my location
          </button>
          <button type="button" onClick={plan} className="inline-flex h-11 items-center justify-center rounded-xl bg-primary px-3 text-sm font-semibold text-primary-fg">
            Plan the loop
          </button>
        </div>
        {note ? <p className="text-sm text-primary">{note}</p> : null}
        {longHop ? (
          <p className="text-sm text-fg">
            The first box is a long hop. If you are outside Denver, drop the start on Civic Center and plan again. Fort Collins is not in this map.
          </p>
        ) : null}
      </section>

      {route.length ? (
        <section className="grid gap-2">
          <div className="flex items-baseline justify-between">
            <h2 className="text-xl">Loop</h2>
            <p className="text-sm text-muted tabular-nums">
              {formatMiles(miles)} · about {formatUsd(cash)}
            </p>
          </div>
          <ol className="grid gap-2">
            {route.map((leg, index) => (
              <li key={leg.stop.id}>
                <button
                  type="button"
                  onClick={() => setActiveStopId(leg.stop.id)}
                  className={`grid w-full gap-1 rounded-xl border p-3 text-left ${leg.stop.id === activeStopId ? "border-primary bg-surface" : "border-border bg-surface"}`}
                >
                  <span className="flex items-center justify-between gap-3">
                    <span className="font-semibold">
                      {index + 1}. {leg.stop.name}
                    </span>
                    <span className="text-sm tabular-nums text-primary">{formatUsd(leg.scoreUsd)}</span>
                  </span>
                  <span className="text-sm text-muted">
                    {leg.stop.neighborhood}
                    {leg.stop.charter ? ` · charter ${leg.stop.charter}` : ""} · {formatMiles(leg.miles)} from previous
                  </span>
                  <span className="text-sm text-muted">{leg.stop.address || "No street address on the map pin"}</span>
                </button>
              </li>
            ))}
          </ol>
          {route[0] ? (
            <a
              href={walkUrl(route.find((leg) => leg.stop.id === activeStopId)?.stop.lat ?? route[0].stop.lat, route.find((leg) => leg.stop.id === activeStopId)?.stop.lon ?? route[0].stop.lon)}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-accent px-3 text-sm font-semibold text-bg"
            >
              <Navigation className="size-4" />
              Walk to the active stop
            </a>
          ) : null}
        </section>
      ) : (
        <section className="grid gap-2">
          <h2 className="text-xl">Nearest book boxes</h2>
          <ul className="grid gap-2">
            {nearest.map(({ stop, miles: hop }) => (
              <li key={stop.id} className="rounded-xl border border-border bg-surface p-3">
                <p className="font-semibold">{stop.name}</p>
                <p className="text-sm text-muted">
                  {stop.neighborhood} · {formatMiles(hop)}
                  {stop.charter ? ` · charter ${stop.charter}` : ""}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}

      <details className="rounded-xl border border-border bg-surface p-4 text-sm">
        <summary className="cursor-pointer font-semibold">Is this every micro-library in Denver?</summary>
        <div className="mt-3 grid gap-2 text-muted">
          <p>No. {libraries.meta.bookcases} book boxes and {libraries.meta.mutualAid} mutual-aid pins are on this map. That is not a definitive census.</p>
          <ul className="grid list-disc gap-1 pl-4">
            {libraries.meta.whyNotDefinitive.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
          <p>{libraries.meta.osmCredit}. Extract: {libraries.meta.bbox.label}.</p>
          <p className="font-semibold text-fg">Where the pins come from</p>
          <ul className="grid list-disc gap-1 pl-4">
            {directorySources.map((entry) => (
              <li key={entry.name}>
                <a href={entry.url} className="underline">
                  {entry.name}
                </a>{" "}
                — {entry.note}
              </li>
            ))}
          </ul>
          <p className="font-semibold text-fg">Named anchors from the city brief</p>
          <ul className="grid list-disc gap-1 pl-4">
            {briefAnchors.map((anchor) => (
              <li key={anchor.name}>
                {anchor.name} · {anchor.address} · {anchor.note}
              </li>
            ))}
          </ul>
        </div>
      </details>
    </div>
  );
}
