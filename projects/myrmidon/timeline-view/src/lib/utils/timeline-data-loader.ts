import { computed, signal } from '@angular/core';

import {
  TimelineDataError,
  TimelineDataSource,
  TimelinePoint,
  TimelinePointWithId,
  TimelineRange,
  TimelineSubscribable,
} from '../models';
import { getIntervalGaps, mergeIntervals } from './timeline-coverage';
import { Interval } from './timeline-interval';

/**
 * Options for a timeline data loader.
 */
export interface TimelineDataLoaderOptions {
  /**
   * Build the range passed to the data source from a value interval.
   * Default is a range with the numbers as labels.
   */
  toRange?: (interval: Interval) => TimelineRange;
  /** Called when loading a range fails. */
  onError?: (error: TimelineDataError) => void;
}

function isSubscribable<T>(value: unknown): value is TimelineSubscribable<T> {
  return (
    !!value &&
    typeof (value as TimelineSubscribable<T>).subscribe === 'function' &&
    typeof (value as PromiseLike<T>).then !== 'function'
  );
}

function defaultToRange(interval: Interval): TimelineRange {
  return {
    start: { label: String(interval.start), value: interval.start },
    end: { label: String(interval.end), value: interval.end },
  };
}

/**
 * Loads timeline points on demand from a `TimelineDataSource`, caching
 * them. It keeps track of the value intervals already loaded and being
 * loaded, so that it requests only the missing gaps of a target interval.
 *
 * - requests are debounced: while the target keeps changing (e.g. during a
 *   drag), nothing is loaded; the missing gaps are requested once it stays
 *   still for the debounce time. The first load is never debounced.
 * - requests in flight are not cancelled when the target changes, because
 *   their results remain valid; they are aborted only when the source
 *   changes, on `reload()` and on `destroy()`. Late results of aborted
 *   requests are ignored.
 * - failed ranges are not marked as loaded, so they are requested again at
 *   the next target change.
 * - points are deduplicated by ID; points without an ID get a unique
 *   negative ID, and cannot be deduplicated.
 *
 * Loaded points are never evicted: memory grows with the explored part of
 * the timeline.
 */
export class TimelineDataLoader {
  private readonly _toRange: (interval: Interval) => TimelineRange;
  private readonly _onError?: (error: TimelineDataError) => void;

  private _source: TimelineDataSource | undefined;
  private _target: Interval | null = null;
  private _generation = 0;
  private _loaded: Interval[] = [];
  private _pending: Interval[] = [];
  private readonly _ids = new Set<number>();
  private _nextAnonymousId = -1;
  private _timer: ReturnType<typeof setTimeout> | undefined;
  private readonly _controllers = new Set<AbortController>();

  private readonly _points = signal<readonly TimelinePointWithId[]>([]);
  private readonly _inFlight = signal(0);

  /** The points loaded so far, in arrival order. */
  public readonly points = this._points.asReadonly();

  /** True while at least one request is in flight. */
  public readonly loading = computed(() => this._inFlight() > 0);

  constructor(options?: TimelineDataLoaderOptions) {
    this._toRange = options?.toRange ?? defaultToRange;
    this._onError = options?.onError;
  }

  /** The intervals loaded so far (sorted and disjoint). */
  public get loadedIntervals(): readonly Interval[] {
    return this._loaded;
  }

  /**
   * Update the source and the target interval to be loaded.
   *
   * @param source The data source. When it differs from the current one,
   * all the loaded points are discarded and pending requests aborted.
   * @param target The value interval which should be loaded, or null to
   * load nothing (any scheduled load is cancelled).
   * @param debounceMs The debounce time in milliseconds.
   */
  public update(
    source: TimelineDataSource | undefined,
    target: Interval | null,
    debounceMs = 0,
  ): void {
    let immediate = false;
    if (source !== this._source) {
      this.reset();
      this._source = source;
      immediate = true;
    }
    this._target = target;
    this.clearTimer();
    if (!source || !target || !this.getGaps(target).length) {
      return;
    }
    // load immediately when nothing is there yet, to show data ASAP
    if (
      immediate ||
      !(debounceMs > 0) ||
      (!this._loaded.length && !this._pending.length)
    ) {
      this.flush();
    } else {
      this._timer = setTimeout(() => {
        this._timer = undefined;
        this.flush();
      }, debounceMs);
    }
  }

  /**
   * Discard all the loaded points and reload the current target.
   */
  public reload(): void {
    const source = this._source;
    const target = this._target;
    this.reset();
    this._source = source;
    this._target = target;
    this.flush();
  }

  /**
   * Abort all the requests and release the loaded points.
   */
  public destroy(): void {
    this.reset();
    this._source = undefined;
    this._target = null;
  }

  private clearTimer(): void {
    if (this._timer !== undefined) {
      clearTimeout(this._timer);
      this._timer = undefined;
    }
  }

  private reset(): void {
    this.clearTimer();
    this._generation++;
    for (const c of this._controllers) {
      c.abort();
    }
    this._controllers.clear();
    this._loaded = [];
    this._pending = [];
    this._ids.clear();
    this._nextAnonymousId = -1;
    this._points.set([]);
    this._inFlight.set(0);
  }

  private getGaps(target: Interval): Interval[] {
    const span = target.end - target.start;
    return getIntervalGaps(
      target,
      [...this._loaded, ...this._pending],
      Math.abs(span) * 1e-9,
    );
  }

  private flush(): void {
    if (!this._source || !this._target) {
      return;
    }
    for (const gap of this.getGaps(this._target)) {
      this.fetch(this._source, gap);
    }
  }

  private addPoints(points: readonly TimelinePoint[] | null | undefined): void {
    if (!points?.length) {
      return;
    }
    const added: TimelinePointWithId[] = [];
    for (const p of points) {
      if (!p || typeof p.value !== 'number' || !Number.isFinite(p.value)) {
        continue;
      }
      if (p.id === undefined || p.id === null) {
        added.push({ ...p, id: this._nextAnonymousId-- });
        continue;
      }
      if (this._ids.has(p.id)) {
        continue;
      }
      this._ids.add(p.id);
      added.push(p as TimelinePointWithId);
    }
    if (added.length) {
      this._points.update((list) => [...list, ...added]);
    }
  }

  private fetch(source: TimelineDataSource, gap: Interval): void {
    const generation = this._generation;
    const controller = new AbortController();
    this._controllers.add(controller);
    this._pending = [...this._pending, gap];
    this._inFlight.update((n) => n + 1);
    const range = this._toRange(gap);
    let done = false;

    const current = () => generation === this._generation;
    const finish = (success: boolean): void => {
      if (done || !current()) {
        done = true;
        return;
      }
      done = true;
      this._controllers.delete(controller);
      this._pending = this._pending.filter((p) => p !== gap);
      if (success) {
        this._loaded = mergeIntervals([...this._loaded, gap]);
      }
      this._inFlight.update((n) => Math.max(0, n - 1));
    };
    const fail = (error: unknown): void => {
      const notify = !done && current();
      finish(false);
      if (notify) {
        this._onError?.({ range, error });
      }
    };
    const next = (points: TimelinePoint[]): void => {
      if (!done && current()) {
        this.addPoints(points);
      }
    };

    let result: ReturnType<TimelineDataSource['getPoints']>;
    try {
      result = source.getPoints(range, controller.signal);
    } catch (error) {
      fail(error);
      return;
    }

    if (isSubscribable<TimelinePoint[]>(result)) {
      let subscription: { unsubscribe(): void } | undefined;
      let aborted = false;
      controller.signal.addEventListener('abort', () => {
        aborted = true;
        subscription?.unsubscribe();
      });
      subscription = result.subscribe({
        next,
        error: fail,
        complete: () => finish(true),
      });
      // the source could have been reset while subscribing
      if (aborted) {
        subscription.unsubscribe();
      }
    } else {
      Promise.resolve(result).then(
        (points) => {
          next(points);
          finish(true);
        },
        fail,
      );
    }
  }
}
