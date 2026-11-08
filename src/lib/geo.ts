import type { LatLng } from "@/lib/types";

export function milesBetween(a: LatLng, b: LatLng): number {
  const radius = 3958.8;
  const toRad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * toRad;
  const dLon = (b.lon - a.lon) * toRad;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * toRad) * Math.cos(b.lat * toRad) * Math.sin(dLon / 2) ** 2;
  return 2 * radius * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function formatMiles(miles: number): string {
  if (miles < 0.1) return `${Math.round(miles * 5280)} ft`;
  return `${miles.toFixed(miles < 10 ? 1 : 0)} mi`;
}

export function formatUsd(usd: number): string {
  const abs = Math.abs(usd);
  const digits = abs >= 20 ? 0 : 2;
  const sign = usd < 0 ? "−" : "";
  return `${sign}$${abs.toFixed(digits)}`;
}

export function walkUrl(lat: number, lon: number): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lon}&travelmode=walking`;
}

export function toIsbn13(raw: string): string | null {
  const compact = raw.replace(/[^0-9Xx]/g, "").toUpperCase();
  const embedded = compact.match(/97[89]\d{10}/);
  if (embedded) return embedded[0];
  if (compact.length !== 10) return null;
  const core = `978${compact.slice(0, 9)}`;
  let sum = 0;
  for (let i = 0; i < 12; i += 1) {
    sum += (i % 2 === 0 ? 1 : 3) * Number(core[i]);
  }
  return `${core}${(10 - (sum % 10)) % 10}`;
}
