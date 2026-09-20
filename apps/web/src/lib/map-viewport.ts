const MOBILE_MAP_BREAKPOINT = 768;
const MOBILE_INITIAL_ZOOM = 9;
const FALLBACK_INITIAL_ZOOM = 10.2;

export function initialMapZoom(initialZoom: number | undefined, viewportWidth: number) {
  const preferredZoom = initialZoom ?? FALLBACK_INITIAL_ZOOM;
  return viewportWidth < MOBILE_MAP_BREAKPOINT
    ? Math.min(preferredZoom, MOBILE_INITIAL_ZOOM)
    : preferredZoom;
}
