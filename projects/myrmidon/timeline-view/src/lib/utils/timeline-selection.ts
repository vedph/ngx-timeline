import {
  TimelinePoint,
  TimelinePointWithId,
  TimelineSelectionMode,
} from '../models';

function getSelectedIndexes(
  ordered: readonly TimelinePointWithId[],
  current: readonly TimelinePoint[],
): number[] {
  if (!current.length) {
    return [];
  }
  const ids = new Set(current.map((p) => p.id));
  const refs = new Set<TimelinePoint>(current);
  const result: number[] = [];
  ordered.forEach((p, i) => {
    if (ids.has(p.id) || refs.has(p)) {
      result.push(i);
    }
  });
  return result;
}

/**
 * Toggle the selection of a point, according to the selection mode.
 *
 * - `single`: clicking a point selects it alone; clicking it again
 *   deselects it.
 * - `sparse`: clicking a point toggles its selection.
 * - `range`: the selection is always a contiguous run of points (in value
 *   order). Clicking an unselected point extends the run up to it; clicking
 *   the first or last point of the run removes it; clicking a point inside
 *   the run restarts the selection from that point alone.
 *
 * @param mode The selection mode.
 * @param ordered All the points, sorted in value order.
 * @param current The current selection. Points are matched by ID (or by
 * reference when they have no ID).
 * @param target The point to toggle.
 * @returns The new selection, sorted in value order. Items are taken from
 * `ordered`.
 */
export function toggleTimelineSelection(
  mode: TimelineSelectionMode,
  ordered: readonly TimelinePointWithId[],
  current: readonly TimelinePoint[],
  target: TimelinePointWithId,
): TimelinePointWithId[] {
  const ti = ordered.findIndex((p) => p.id === target.id);
  if (ti === -1) {
    return getSelectedIndexes(ordered, current).map((i) => ordered[i]);
  }
  const selected = getSelectedIndexes(ordered, current);
  const isSelected = selected.includes(ti);

  switch (mode) {
    case 'single':
      return isSelected && selected.length === 1 ? [] : [ordered[ti]];

    case 'sparse': {
      const next = isSelected
        ? selected.filter((i) => i !== ti)
        : [...selected, ti].sort((a, b) => a - b);
      return next.map((i) => ordered[i]);
    }

    case 'range': {
      if (!selected.length) {
        return [ordered[ti]];
      }
      // normalize to a contiguous run
      let lo = selected[0];
      let hi = selected[selected.length - 1];
      if (ti >= lo && ti <= hi) {
        if (lo === hi) {
          return [];
        }
        if (ti === lo) {
          lo++;
        } else if (ti === hi) {
          hi--;
        } else {
          return [ordered[ti]];
        }
      } else {
        lo = Math.min(lo, ti);
        hi = Math.max(hi, ti);
      }
      return ordered.slice(lo, hi + 1);
    }
  }
}

/**
 * Add several points to the selection at once (e.g. all the points in a
 * group), according to the selection mode. In `single` mode, the selection
 * is not changed unless the targets are a single point.
 *
 * @returns The new selection, sorted in value order.
 */
export function addToTimelineSelection(
  mode: TimelineSelectionMode,
  ordered: readonly TimelinePointWithId[],
  current: readonly TimelinePoint[],
  targets: readonly TimelinePointWithId[],
): TimelinePointWithId[] {
  const selected = getSelectedIndexes(ordered, current);
  const added = getSelectedIndexes(ordered, targets);
  if (!added.length) {
    return selected.map((i) => ordered[i]);
  }
  switch (mode) {
    case 'single':
      return added.length === 1
        ? [ordered[added[0]]]
        : selected.map((i) => ordered[i]);
    case 'sparse': {
      const all = [...new Set([...selected, ...added])].sort((a, b) => a - b);
      return all.map((i) => ordered[i]);
    }
    case 'range': {
      const all = [...selected, ...added];
      return ordered.slice(Math.min(...all), Math.max(...all) + 1);
    }
  }
}
