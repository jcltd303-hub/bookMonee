import { useEffect, useRef, useState } from "react";
import { mapConfig } from "@/lib/map-config";
import type { LatLng, PlannedLeg, Stop } from "@/lib/types";
import "leaflet/dist/leaflet.css";

type Props = {
  start: LatLng;
  route: PlannedLeg[];
  boxes: Stop[];
  mutual: Stop[];
  showMutual: boolean;
  activeId: string;
  /** Bounds to frame when the selected section changes. */
  focus: { south: number; west: number; north: number; east: number } | null;
  focusKey: string;
  onStart: (point: LatLng) => void;
  onSelect: (id: string) => void;
};

export function MapView(props: Props) {
  const host = useRef<HTMLDivElement>(null);
  const mapRef = useRef<import("leaflet").Map | null>(null);
  const groupRef = useRef<import("leaflet").LayerGroup | null>(null);
  const handlers = useRef({ onStart: props.onStart, onSelect: props.onSelect });
  handlers.current = { onStart: props.onStart, onSelect: props.onSelect };
  const [ready, setReady] = useState(false);
  const fitted = useRef("");
  const framed = useRef("");

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let dead = false;
    void import("leaflet").then((L) => {
      if (dead || mapRef.current) return;
      const map = L.map(el, { zoomControl: true }).setView([props.start.lat, props.start.lon], 13);
      const tiles = mapConfig();
      L.tileLayer(tiles.url, {
        attribution: tiles.attribution,
        subdomains: tiles.subdomains || undefined,
        maxZoom: tiles.maxZoom,
      }).addTo(map);
      map.on("click", (event) => {
        handlers.current.onStart({ lat: event.latlng.lat, lon: event.latlng.lng });
      });
      mapRef.current = map;
      setReady(true);
      requestAnimationFrame(() => map.invalidateSize());
    });
    return () => {
      dead = true;
      groupRef.current = null;
      mapRef.current?.remove();
      mapRef.current = null;
    };
    // Map instance is created once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    let cancelled = false;
    void import("leaflet").then((L) => {
      if (cancelled) return;
      groupRef.current?.remove();
      const group = L.layerGroup().addTo(map);
      groupRef.current = group;
      const style = getComputedStyle(document.documentElement);
      const accent = style.getPropertyValue("--color-accent").trim();
      const brass = style.getPropertyValue("--color-primary").trim();
      const muted = style.getPropertyValue("--color-muted").trim();
      const bg = style.getPropertyValue("--color-bg").trim();
      if (props.showMutual) {
        for (const stop of props.mutual) {
          L.circleMarker([stop.lat, stop.lon], {
            radius: 5,
            color: muted,
            weight: 1,
            fillColor: bg,
            fillOpacity: 0.2,
          })
            .bindTooltip(`${stop.name} · mutual aid`, { direction: "top" })
            .addTo(group);
        }
      }
      const routed = new Set(props.route.map((leg) => leg.stop.id));
      for (const stop of props.boxes) {
        if (routed.has(stop.id)) continue;
        const marker = L.circleMarker([stop.lat, stop.lon], {
          radius: stop.id === props.activeId ? 8 : 5,
          color: accent,
          weight: 2,
          fillColor: accent,
          fillOpacity: 0.75,
        });
        marker.on("click", () => handlers.current.onSelect(stop.id));
        marker.bindTooltip(stop.name, { direction: "top" });
        marker.addTo(group);
      }
      props.route.forEach((leg, index) => {
        const marker = L.marker([leg.stop.lat, leg.stop.lon], {
          icon: L.divIcon({
            className: leg.stop.id === props.activeId ? "pin pin-on" : "pin",
            html: `<span>${index + 1}</span>`,
            iconSize: [28, 28],
            iconAnchor: [14, 14],
          }),
          zIndexOffset: 400,
        });
        marker.on("click", () => handlers.current.onSelect(leg.stop.id));
        marker.addTo(group);
      });
      // Hollow ring for the start: filled brass circles are loop stops, and two
      // identical markers with different meanings is a legend nobody can read.
      L.circleMarker([props.start.lat, props.start.lon], {
        radius: 9,
        color: brass,
        weight: 3,
        fillColor: brass,
        fillOpacity: 0,
      })
        .bindTooltip("Start", { direction: "top" })
        .addTo(group);
      if (props.route.length) {
        const points: [number, number][] = [
          [props.start.lat, props.start.lon],
          ...props.route.map((leg) => [leg.stop.lat, leg.stop.lon] as [number, number]),
        ];
        L.polyline(points, { color: brass, weight: 3, opacity: 0.9 }).addTo(group);
        const key = points.map((point) => point.join(",")).join("|");
        if (fitted.current !== key) {
          fitted.current = key;
          map.fitBounds(points, { padding: [28, 28], maxZoom: 15 });
        }
      }
    });
    return () => {
      cancelled = true;
    };
  }, [ready, props.start, props.route, props.boxes, props.mutual, props.showMutual, props.activeId]);

  // Framing the section is separate from fitting the loop: choosing a region should
  // move the map even when the route has not changed.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !props.focus) return;
    if (framed.current === props.focusKey) return;
    framed.current = props.focusKey;
    map.fitBounds(
      [
        [props.focus.south, props.focus.west],
        [props.focus.north, props.focus.east],
      ],
      { padding: [24, 24], maxZoom: 15 },
    );
  }, [ready, props.focus, props.focusKey]);

  return <div ref={host} className="h-full w-full" />;
}
