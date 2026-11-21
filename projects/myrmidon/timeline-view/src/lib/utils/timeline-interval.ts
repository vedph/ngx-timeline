/**
 * A numeric interval in projection (U) space.
 */
export interface Interval {
  start: number;
  end: number;
}

/**
 * Clamp an interval inside a total interval, enforcing a minimum span.
 * The span is preserved whenever possible, shifting the interval inside
 * the total bounds.
 */
export function clampInterval(
  view: Interval,
  total: Interval,
  minSpan = 0,
): Interval {
  const totalSpan = Math.max(0, total.end - total.start);
  let start = Math.min(view.start, view.end);
  let end = Math.max(view.start, view.end);
  const span = Math.min(
    totalSpan,
    Math.max(end - start, Math.min(minSpan, totalSpan)),
  );
  if (end - start < span) {
    const center = (start + end) / 2;
    start = center - span / 2;
  }
  start = Math.min(Math.max(start, total.start), total.end - span);
  end = start + span;
  return { start, end };
}

/**
 * Zoom an interval by the specified factor around an anchor.
 *
 * @param view The current interval.
 * @param factor The zoom factor: >1 zooms in, <1 zooms out.
 * @param anchor The U coordinate staying fixed while zooming.
 * @param total The total interval.
 * @param minSpan The minimum allowed span.
 */
export function zoomInterval(
  view: Interval,
  factor: number,
  anchor: number,
  total: Interval,
  minSpan = 0,
): Interval {
  if (!(factor > 0) || !Number.isFinite(factor)) {
    return clampInterval(view, total, minSpan);
  }
  const span = view.end - view.start;
  const newSpan = Math.max(
    Math.min(span / factor, total.end - total.start),
    Math.min(minSpan, total.end - total.start),
  );
  const ratio = span > 0 ? (anchor - view.start) / span : 0.5;
  const start = anchor - ratio * newSpan;
  return clampInterval({ start, end: start + newSpan }, total, minSpan);
}

/**
 * Shift an interval by delta, keeping it inside the total interval.
 */
export function panInterval(
  view: Interval,
  delta: number,
  total: Interval,
): Interval {
  return clampInterval(
    { start: view.start + delta, end: view.end + delta },
    total,
  );
}

/**
 * Get the zoom level of a view interval relative to the total interval
 * (1 = no zoom).
 */
export function getZoomLevel(view: Interval, total: Interval): number {
  const span = view.end - view.start;
  const totalSpan = total.end - total.start;
  return span > 0 && totalSpan > 0 ? totalSpan / span : 1;
}

/**
 * Get an interval with the specified zoom level, centered on the center
 * of the view interval.
 */
export function intervalAtZoom(
  view: Interval,
  zoom: number,
  total: Interval,
  minSpan = 0,
): Interval {
  const span = (total.end - total.start) / Math.max(1, zoom);
  const center = (view.start + view.end) / 2;
  return clampInterval(
    { start: center - span / 2, end: center + span / 2 },
    total,
    minSpan,
  );
}

/**
 * Map a zoom level into a slider position, using a logarithmic scale.
 *
 * @param zoom The zoom level (>= 1).
 * @param maxZoom The maximum zoom level.
 * @param steps The slider steps.
 */
export function zoomToSlider(zoom: number, maxZoom: number, steps: number): number {
  if (maxZoom <= 1 || zoom <= 1) {
    return 0;
  }
  const s = Math.round((Math.log(zoom) / Math.log(maxZoom)) * steps);
  return Math.min(steps, Math.max(0, s));
}

/**
 * Map a slider position into a zoom level (inverse of `zoomToSlider`).
 */
export function sliderToZoom(value: number, maxZoom: number, steps: number): number {
  if (maxZoom <= 1 || steps <= 0) {
    return 1;
  }
  const v = Math.min(steps, Math.max(0, value));
  return Math.pow(maxZoom, v / steps);
}

/**
 * Check whether two intervals are equal within a tolerance relative to the
 * specified reference span.
 */
export function intervalsEqual(
  a: Interval,
  b: Interval,
  referenceSpan: number,
  tolerance = 1e-6,
): boolean {
  const eps = Math.abs(referenceSpan) * tolerance;
  return Math.abs(a.start - b.start) <= eps && Math.abs(a.end - b.end) <= eps;
}
