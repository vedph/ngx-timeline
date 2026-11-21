import {
  DecoratedTimelineRange,
  TimelinePoint,
  TimelinePointWithId,
  TimelineRange,
} from '../models';

/**
 * Ensure that every point has an ID: points without an ID get their
 * 1-based ordinal number in the array. Points are shallow-copied only
 * when needed.
 */
export function normalizeTimelinePoints(
  points: readonly TimelinePoint[] | null | undefined,
): TimelinePointWithId[] {
  if (!points?.length) {
    return [];
  }
  return points.map((p, i) =>
    p.id !== undefined && p.id !== null
      ? (p as TimelinePointWithId)
      : { ...p, id: i + 1 },
  );
}

/**
 * Compare two points by value, then by ID.
 */
export function compareTimelinePoints(
  a: TimelinePointWithId,
  b: TimelinePointWithId,
): number {
  return a.value - b.value || a.id - b.id;
}

/**
 * Sort points by value and ID (a new array is returned).
 */
export function sortTimelinePoints(
  points: readonly TimelinePointWithId[],
): TimelinePointWithId[] {
  return [...points].sort(compareTimelinePoints);
}

/**
 * True if the specified preset range is a custom range, i.e. a range whose
 * start and end values are both 0. Picking it lets users type a range.
 */
export function isCustomTimelineRange(range: TimelineRange | DecoratedTimelineRange): boolean {
  return range.start.value === 0 && range.end.value === 0;
}

/**
 * Find the index of the first point whose value (or U) is >= the target,
 * in an array sorted in ascending order.
 */
export function lowerBound(sorted: readonly number[], target: number): number {
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid] < target) {
      lo = mid + 1;
    } else {
      hi = mid;
    }
  }
  return lo;
}

/**
 * Find the index after the last point whose value (or U) is <= the target,
 * in an array sorted in ascending order.
 */
export function upperBound(sorted: readonly number[], target: number): number {
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid] <= target) {
      lo = mid + 1;
    } else {
      hi = mid;
    }
  }
  return lo;
}
