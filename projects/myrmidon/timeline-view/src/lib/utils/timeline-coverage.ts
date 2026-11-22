import { Interval } from './timeline-interval';

/**
 * Merge the specified intervals into a sorted list of disjoint intervals.
 * Overlapping or touching intervals are merged. Empty or invalid intervals
 * (start > end, or not finite) are dropped.
 */
export function mergeIntervals(intervals: readonly Interval[]): Interval[] {
  const valid = intervals
    .filter(
      (i) =>
        Number.isFinite(i.start) && Number.isFinite(i.end) && i.start <= i.end,
    )
    .sort((a, b) => a.start - b.start || a.end - b.end);
  const result: Interval[] = [];
  for (const i of valid) {
    const last = result[result.length - 1];
    if (last && i.start <= last.end) {
      if (i.end > last.end) {
        result[result.length - 1] = { start: last.start, end: i.end };
      }
    } else {
      result.push({ start: i.start, end: i.end });
    }
  }
  return result;
}

/**
 * Get the parts of a target interval which are not covered by any of the
 * specified intervals.
 *
 * @param target The target interval.
 * @param covered The covered intervals, in any order (they can overlap).
 * @param epsilon Gaps whose span is not greater than this value are
 * ignored. This avoids requests for tiny gaps caused by rounding.
 * @returns The uncovered gaps, sorted.
 */
export function getIntervalGaps(
  target: Interval,
  covered: readonly Interval[],
  epsilon = 0,
): Interval[] {
  if (!(target.end >= target.start)) {
    return [];
  }
  const gaps: Interval[] = [];
  let cursor = target.start;
  for (const c of mergeIntervals(covered)) {
    if (c.end < cursor) {
      continue;
    }
    if (c.start > target.end) {
      break;
    }
    if (c.start > cursor) {
      gaps.push({ start: cursor, end: c.start });
    }
    cursor = Math.max(cursor, c.end);
    if (cursor >= target.end) {
      break;
    }
  }
  if (cursor < target.end) {
    gaps.push({ start: cursor, end: target.end });
  }
  return gaps.filter((g) => g.end - g.start > epsilon);
}
