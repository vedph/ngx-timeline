import { InjectionToken } from '@angular/core';

/**
 * The shape used to draw a timeline point.
 */
export type TimelinePointShape = 'rectangle' | 'oval';

/**
 * A point in the timeline.
 */
export interface TimelinePoint {
  /**
   * A numeric unique ID. When not set, the component assigns the ordinal
   * number of the point in the received array (1=first, 2=second, etc.).
   */
  id?: number;
  /**
   * A human-friendly label for the point's chronological value.
   */
  label: string;
  /**
   * The value of the point on the timeline, computed by consumer code
   * (e.g. a year, a Julian day, a Unix timestamp...).
   */
  value: number;
  /**
   * An optional CSS color (hex or color name) to fill the point's shape.
   * The label color is then automatically picked for best contrast.
   * The special value `auto` assigns a color from a pastel palette, using
   * the point's ID as the key.
   */
  color?: string;
  /**
   * The shape of the point. Default is `rectangle`.
   */
  shape?: TimelinePointShape;
  /**
   * An optional tooltip.
   */
  tip?: string;
}

/**
 * A timeline point whose ID is guaranteed to be set.
 */
export type TimelinePointWithId = TimelinePoint & { id: number };

/**
 * A range in the timeline. Only `value` and `label` of its points are
 * relevant.
 */
export interface TimelineRange {
  start: TimelinePoint;
  end: TimelinePoint;
}

/**
 * A timeline range with a label and an optional color, used for preset
 * view ranges and for highlighted ranges.
 */
export interface DecoratedTimelineRange extends TimelineRange {
  label: string;
  color?: string;
}

export type TimelineOrientation = 'horizontal' | 'vertical';

/**
 * Sort direction: when horizontal, `ascending` means that values increase
 * rightwards; when vertical, downwards.
 */
export type TimelineSort = 'ascending' | 'descending';

/**
 * Where points are placed relative to the timeline axis.
 */
export type TimelineLayout = 'leftOrAbove' | 'rightOrBelow' | 'alternating';

/**
 * Selection mode: `single` = at most 1 point; `range` = 1 or more contiguous
 * points; `sparse` = any set of points.
 */
export type TimelineSelectionMode = 'single' | 'range' | 'sparse';

/**
 * A parser used to convert user-typed text into timeline values, and
 * optionally to format values for display (ruler ticks, range bounds).
 */
export interface TimelineParser {
  /**
   * Parse the specified text into a range. A single textual value usually
   * has a granularity (e.g. "1492" = the whole year), so the result is a
   * range: for a precise value, just return a range with equal start and end.
   *
   * @param text The text to parse.
   * @returns The parsed range, or null if the text is not valid.
   */
  parse(text: string): TimelineRange | null;

  /**
   * Optionally format the specified value for display. Whatever this
   * returns should be parseable by `parse`.
   *
   * @param value The value to format.
   * @param step The approximate resolution required, e.g. the distance
   * between two ruler ticks. Can be used to choose the output precision.
   */
  format?(value: number, step?: number): string;
}

/**
 * A minimal subscribable, structurally compatible with an RxJS
 * `Observable`. It lets data sources return observables without making
 * RxJS a dependency of the library.
 */
export interface TimelineSubscribable<T> {
  subscribe(observer: {
    next?: (value: T) => void;
    error?: (error: unknown) => void;
    complete?: () => void;
  }): { unsubscribe(): void };
}

/**
 * A source of timeline points loaded on demand ("virtual data"). The
 * timeline keeps track of the value ranges it has already loaded, and asks
 * the source only for the missing ones, so the source can be stateless.
 */
export interface TimelineDataSource {
  /**
   * Get the points whose value is inside the specified range (both bounds
   * included). Every point MUST have a unique, stable `id`: points whose
   * ID was already received are ignored, so overlapping results are safe.
   *
   * @param range The range to load. It never includes a range already
   * loaded, or being loaded.
   * @param signal An abort signal, triggered when the result is no longer
   * needed (e.g. the source was replaced, or the timeline destroyed).
   * @returns A promise resolving to the points, or a subscribable (e.g.
   * an RxJS observable). A subscribable can emit points in several
   * batches: each batch is displayed as soon as it arrives, and the range
   * is considered loaded when it completes.
   */
  getPoints(
    range: TimelineRange,
    signal: AbortSignal,
  ): Promise<TimelinePoint[]> | TimelineSubscribable<TimelinePoint[]>;
}

/**
 * An error which occurred while loading points from a data source.
 */
export interface TimelineDataError {
  /** The range being loaded. */
  range: TimelineRange;
  /** The error. */
  error: unknown;
}

/**
 * An optional injection token to provide a default parser to all the
 * timeline components in an injector. The `parser` input takes precedence.
 */
export const TIMELINE_PARSER = new InjectionToken<TimelineParser>(
  'TIMELINE_PARSER',
);
