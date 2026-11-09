/**
 * Map tile configuration.
 *
 * The tiles are the one part of the map that comes from someone else's server, so the
 * provider is configuration rather than a constant baked into the component: set it in
 * the Vercel project (or a local `.env`) and the same build serves a different basemap.
 * Defaults to CARTO's dark basemap, which needs no key, so a deploy with no environment
 * variables still works.
 *
 *   VITE_MAP_TILES_URL     full tile template, e.g. https://…/{z}/{x}/{y}.png
 *   VITE_MAP_ATTRIBUTION   the credit line that must accompany those tiles
 *   VITE_MAP_MAX_ZOOM      defaults to 19
 *   VITE_MAPTILER_KEY      convenience: builds a MapTiler streets URL if no template is set
 */
export type MapConfig = {
  url: string;
  attribution: string;
  maxZoom: number;
  subdomains: string;
  /** Which provider the build is using, for the caption. */
  provider: string;
};

const DEFAULTS = {
  url: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
  maxZoom: 19,
  subdomains: "abcd",
};

function env(key: string): string {
  const value = (import.meta.env as Record<string, string | undefined>)[key];
  return typeof value === "string" ? value.trim() : "";
}

export function mapConfig(): MapConfig {
  const explicit = env("VITE_MAP_TILES_URL");
  const maptilerKey = env("VITE_MAPTILER_KEY");
  const attribution = env("VITE_MAP_ATTRIBUTION");
  const maxZoom = Number(env("VITE_MAP_MAX_ZOOM"));

  if (explicit) {
    return {
      url: explicit,
      attribution: attribution || DEFAULTS.attribution,
      maxZoom: Number.isFinite(maxZoom) && maxZoom > 0 ? maxZoom : DEFAULTS.maxZoom,
      subdomains: DEFAULTS.subdomains,
      provider: "configured",
    };
  }

  if (maptilerKey) {
    return {
      url: `https://api.maptiler.com/maps/streets-v2/{z}/{x}/{y}.png?key=${maptilerKey}`,
      attribution: attribution || `${DEFAULTS.attribution} &copy; <a href="https://www.maptiler.com/">MapTiler</a>`,
      maxZoom: Number.isFinite(maxZoom) && maxZoom > 0 ? maxZoom : 20,
      subdomains: "",
      provider: "maptiler",
    };
  }

  return { ...DEFAULTS, provider: "carto" };
}
