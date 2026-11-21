import { TimelineOrientation } from '../models';

/**
 * The side of the axis where an item is placed: `before` = above (horizontal)
 * or left (vertical); `after` = below or right.
 */
export type TimelineSide = 'before' | 'after';

/**
 * An entry to be laid out.
 */
export interface TimelineLayoutEntry<T> {
  /** A unique key for the entry. */
  key: string;
  /** The position of the entry along the axis, in pixels. */
  a: number;
  /** The extent of the entry's box along the axis, in pixels. */
  ext: number;
  /** The thickness of the entry's box perpendicular to the axis. */
  thick: number;
  /** The payload. */
  data: T;
}

/**
 * A rectangle.
 */
export interface TimelineRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * A segment.
 */
export interface TimelineSegment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/**
 * A laid out item: either a single point or a group of points which would
 * otherwise overlap.
 */
export interface TimelineLayoutItem<T> {
  kind: 'point' | 'group';
  key: string;
  members: TimelineLayoutEntry<T>[];
  /** The position along the axis where the item is attached. */
  anchor: number;
  /** The minimum position along the axis of the members. */
  spanStart: number;
  /** The maximum position along the axis of the members. */
  spanEnd: number;
  side: TimelineSide;
  tier: number;
  box: TimelineRect;
  connector: TimelineSegment;
  /** For groups, the segment along the axis covering all the members. */
  bracket?: TimelineSegment;
}

/**
 * Layout options.
 */
export interface TimelineLayoutOptions {
  orientation: TimelineOrientation;
  /** The sides used for placing items, in order of preference. When two
   * sides are given, items alternate between them. */
  sides: TimelineSide[];
  /** The total length of the axis, in pixels. */
  length: number;
  /** The position of the axis on the perpendicular coordinate. */
  axisPos: number;
  /** The number of tiers available on each side. */
  tiers: number;
  /** The length of the connector from the axis to the first tier. */
  connector: number;
  /** The thickness of each tier. */
  tierThickness: number;
  /** The gap between tiers. */
  tierGap: number;
  /** The minimum gap between two boxes in the same tier. */
  itemGap: number;
  /** The margin from the axis ends which boxes cannot overflow. */
  edgeMargin: number;
  /** Get the box size (along the axis and perpendicular) of a group. */
  groupSize: (count: number) => { ext: number; thick: number };
}

interface Cluster<T> {
  members: TimelineLayoutEntry<T>[];
  side: number;
  tier: number;
  prevEnd: number;
  center: number;
  ext: number;
  thick: number;
}

/**
 * Lay out the specified entries, placing each one in the first tier
 * (nearest to the axis) where it does not overlap previous entries, and
 * merging it into a group with the previous item when no such tier exists.
 *
 * @param entries The entries, sorted by `a` in ascending order.
 * @param options The layout options.
 * @returns The laid out items, in ascending order of position.
 */
export function layoutTimelineItems<T>(
  entries: readonly TimelineLayoutEntry<T>[],
  options: TimelineLayoutOptions,
): TimelineLayoutItem<T>[] {
  const o = options;
  const sideCount = Math.max(1, Math.min(2, o.sides.length));
  const tiers = Math.max(1, Math.floor(o.tiers));
  const ends: number[][] = Array.from({ length: sideCount }, () =>
    Array<number>(tiers).fill(Number.NEGATIVE_INFINITY),
  );
  const clusters: Cluster<T>[] = [];
  let nextSide = 0;

  const clampCenter = (center: number, ext: number): number => {
    const min = o.edgeMargin + ext / 2;
    const max = o.length - o.edgeMargin - ext / 2;
    return max < min ? o.length / 2 : Math.min(Math.max(center, min), max);
  };

  for (const e of entries) {
    const center = clampCenter(e.a, e.ext);
    const lo = center - e.ext / 2;
    let placed = false;
    const sideOrder = sideCount === 2 ? [nextSide, 1 - nextSide] : [0];

    for (let t = 0; t < tiers && !placed; t++) {
      for (const s of sideOrder) {
        if (ends[s][t] + o.itemGap <= lo) {
          clusters.push({
            members: [e],
            side: s,
            tier: t,
            prevEnd: ends[s][t],
            center,
            ext: e.ext,
            thick: e.thick,
          });
          ends[s][t] = center + e.ext / 2;
          if (sideCount === 2) {
            nextSide = 1 - s;
          }
          placed = true;
          break;
        }
      }
    }

    if (!placed) {
      // merge into the last cluster
      const c = clusters[clusters.length - 1];
      c.members.push(e);
      const size = o.groupSize(c.members.length);
      const first = c.members[0].a;
      const anchor = (first + e.a) / 2;
      c.ext = size.ext;
      c.thick = size.thick;
      c.center = clampCenter(
        Math.max(anchor, c.prevEnd + o.itemGap + c.ext / 2),
        c.ext,
      );
      ends[c.side][c.tier] = Math.max(
        ends[c.side][c.tier],
        c.center + c.ext / 2,
      );
    }
  }

  const horizontal = o.orientation === 'horizontal';
  return clusters.map((c) => {
    const side: TimelineSide = o.sides[c.side] ?? 'after';
    const sign = side === 'before' ? -1 : 1;
    const offset = o.connector + c.tier * (o.tierThickness + o.tierGap);
    const spanStart = c.members[0].a;
    const spanEnd = c.members[c.members.length - 1].a;
    const anchor =
      c.members.length === 1 ? c.members[0].a : (spanStart + spanEnd) / 2;
    const lo = c.center - c.ext / 2;
    const near = o.axisPos + sign * offset;
    const far = near + sign * c.thick;
    const connectorEnd = Math.min(Math.max(anchor, lo + 4), lo + c.ext - 4);

    const box: TimelineRect = horizontal
      ? { x: lo, y: Math.min(near, far), width: c.ext, height: c.thick }
      : { x: Math.min(near, far), y: lo, width: c.thick, height: c.ext };
    const connector: TimelineSegment = horizontal
      ? { x1: anchor, y1: o.axisPos, x2: connectorEnd, y2: near }
      : { x1: o.axisPos, y1: anchor, x2: near, y2: connectorEnd };
    const item: TimelineLayoutItem<T> = {
      kind: c.members.length === 1 ? 'point' : 'group',
      key:
        c.members.length === 1
          ? c.members[0].key
          : `g:${c.members[0].key}~${c.members[c.members.length - 1].key}`,
      members: c.members,
      anchor,
      spanStart,
      spanEnd,
      side,
      tier: c.tier,
      box,
      connector,
    };
    if (c.members.length > 1) {
      item.bracket = horizontal
        ? { x1: spanStart, y1: o.axisPos, x2: spanEnd, y2: o.axisPos }
        : { x1: o.axisPos, y1: spanStart, x2: o.axisPos, y2: spanEnd };
    }
    return item;
  });
}

/**
 * Get the number of tiers fitting in the specified space.
 */
export function getTierCount(
  space: number,
  connector: number,
  tierThickness: number,
  tierGap: number,
  maxTiers: number,
): number {
  const n = Math.floor(
    (space - connector + tierGap) / Math.max(1, tierThickness + tierGap),
  );
  return Math.max(1, Math.min(maxTiers, n));
}
