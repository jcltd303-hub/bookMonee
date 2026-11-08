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

/** ISBN-13 check digit: alternating 1/3 weights over the first twelve digits. */
export function isbn13Valid(digits: string): boolean {
  if (!/^97[89]\d{10}$/.test(digits)) return false;
  let sum = 0;
  for (let i = 0; i < 12; i += 1) sum += (i % 2 === 0 ? 1 : 3) * Number(digits[i]);
  return (10 - (sum % 10)) % 10 === Number(digits[12]);
}

/** ISBN-10 check digit: weights 10..1, last character may be X. */
export function isbn10Valid(compact: string): boolean {
  if (!/^\d{9}[\dX]$/.test(compact)) return false;
  let sum = 0;
  for (let i = 0; i < 10; i += 1) {
    const value = compact[i] === "X" ? 10 : Number(compact[i]);
    sum += (10 - i) * value;
  }
  return sum % 11 === 0;
}

/**
 * Canonical ISBN-13, or null.
 *
 * The checksum is verified, not just the shape: a random thirteen-digit run starts
 * with 978/979 about one time in five and passes the check digit one time in ten, so
 * shape-only validation lets garbage through — which matters most when the digits
 * came from OCR of a spine rather than a barcode scanner.
 */
export function toIsbn13(raw: string): string | null {
  const compact = raw.replace(/[^0-9Xx]/g, "").toUpperCase();
  for (const candidate of compact.match(/97[89]\d{10}/g) ?? []) {
    if (isbn13Valid(candidate)) return candidate;
  }
  if (compact.length !== 10 || !isbn10Valid(compact)) return null;
  const core = `978${compact.slice(0, 9)}`;
  let sum = 0;
  for (let i = 0; i < 12; i += 1) {
    sum += (i % 2 === 0 ? 1 : 3) * Number(core[i]);
  }
  return `${core}${(10 - (sum % 10)) % 10}`;
}
