import {
  TimelineDataError,
  TimelineDataSource,
  TimelinePoint,
  TimelineRange,
  TimelineSubscribable,
} from '../models';
import { TimelineDataLoader } from './timeline-data-loader';

const i = (start: number, end: number) => ({ start, end });

interface Call {
  range: TimelineRange;
  signal: AbortSignal;
  resolve: (points: TimelinePoint[]) => void;
  reject: (error: unknown) => void;
}

/** A source whose requests are resolved manually. */
class ManualSource implements TimelineDataSource {
  public readonly calls: Call[] = [];

  public getPoints(
    range: TimelineRange,
    signal: AbortSignal,
  ): Promise<TimelinePoint[]> {
    return new Promise((resolve, reject) =>
      this.calls.push({ range, signal, resolve, reject }),
    );
  }

  public get ranges(): [number, number][] {
    return this.calls.map((c) => [c.range.start.value, c.range.end.value]);
  }
}

/** Points with IDs equal to their (integer) values in a range. */
function pointsIn(start: number, end: number): TimelinePoint[] {
  const result: TimelinePoint[] = [];
  for (let v = Math.ceil(start); v <= end; v++) {
    result.push({ id: v, label: `P${v}`, value: v });
  }
  return result;
}

/** Let pending promise callbacks run. */
const settle = () => vi.advanceTimersByTimeAsync(0);

describe('TimelineDataLoader', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('should load the first target immediately', async () => {
    const source = new ManualSource();
    const loader = new TimelineDataLoader();
    loader.update(source, i(0, 10), 300);
    expect(source.ranges).toEqual([[0, 10]]);
    expect(loader.loading()).toBe(true);

    source.calls[0].resolve(pointsIn(0, 10));
    await settle();
    expect(loader.loading()).toBe(false);
    expect(loader.points().length).toBe(11);
    expect(loader.loadedIntervals).toEqual([i(0, 10)]);
  });

  it('should request only the missing gaps', async () => {
    const source = new ManualSource();
    const loader = new TimelineDataLoader();
    loader.update(source, i(10, 20), 0);
    source.calls[0].resolve(pointsIn(10, 20));
    await settle();

    loader.update(source, i(0, 30), 0);
    expect(source.ranges).toEqual([
      [10, 20],
      [0, 10],
      [20, 30],
    ]);
  });

  it('should not request a range already loaded', async () => {
    const source = new ManualSource();
    const loader = new TimelineDataLoader();
    loader.update(source, i(0, 100), 0);
    source.calls[0].resolve([]);
    await settle();

    loader.update(source, i(20, 30), 0);
    expect(source.calls.length).toBe(1);
  });

  it('should not request a range being loaded', () => {
    const source = new ManualSource();
    const loader = new TimelineDataLoader();
    loader.update(source, i(0, 10), 0);
    loader.update(source, i(5, 15), 0);
    expect(source.ranges).toEqual([
      [0, 10],
      [10, 15],
    ]);
  });

  it('should debounce the target changes', async () => {
    const source = new ManualSource();
    const loader = new TimelineDataLoader();
    loader.update(source, i(0, 10), 300);
    source.calls[0].resolve([]);
    await settle();

    loader.update(source, i(10, 20), 300);
    await vi.advanceTimersByTimeAsync(200);
    loader.update(source, i(20, 30), 300);
    await vi.advanceTimersByTimeAsync(200);
    loader.update(source, i(30, 40), 300);
    expect(source.calls.length).toBe(1);

    await vi.advanceTimersByTimeAsync(300);
    // only the last target is requested
    expect(source.ranges).toEqual([
      [0, 10],
      [30, 40],
    ]);
  });

  it('should cancel a scheduled load when the target is covered', async () => {
    const source = new ManualSource();
    const loader = new TimelineDataLoader();
    loader.update(source, i(0, 10), 300);
    source.calls[0].resolve([]);
    await settle();

    loader.update(source, i(5, 15), 300);
    loader.update(source, i(2, 8), 300);
    await vi.advanceTimersByTimeAsync(1000);
    expect(source.calls.length).toBe(1);
  });

  it('should cancel a scheduled load when the target is null', async () => {
    const source = new ManualSource();
    const loader = new TimelineDataLoader();
    loader.update(source, i(0, 10), 300);
    loader.update(source, i(10, 20), 300);
    loader.update(source, null, 300);
    await vi.advanceTimersByTimeAsync(1000);
    expect(source.calls.length).toBe(1);
  });

  it('should deduplicate points by ID', async () => {
    const source = new ManualSource();
    const loader = new TimelineDataLoader();
    loader.update(source, i(0, 10), 0);
    loader.update(source, i(0, 20), 0);
    source.calls[0].resolve(pointsIn(0, 10));
    // bounds are inclusive, so point 10 is returned again
    source.calls[1].resolve(pointsIn(10, 20));
    await settle();
    expect(loader.points().map((p) => p.id)).toEqual(
      pointsIn(0, 20).map((p) => p.id),
    );
  });

  it('should assign unique negative IDs to points without an ID', async () => {
    const source = new ManualSource();
    const loader = new TimelineDataLoader();
    loader.update(source, i(0, 10), 0);
    source.calls[0].resolve([
      { label: 'a', value: 1 },
      { label: 'b', value: 2 },
    ]);
    await settle();
    expect(loader.points().map((p) => p.id)).toEqual([-1, -2]);
  });

  it('should skip points without a finite value', async () => {
    const source = new ManualSource();
    const loader = new TimelineDataLoader();
    loader.update(source, i(0, 10), 0);
    source.calls[0].resolve([
      { id: 1, label: 'a', value: NaN },
      { id: 2, label: 'b', value: 2 },
    ]);
    await settle();
    expect(loader.points().map((p) => p.id)).toEqual([2]);
  });

  it('should report errors and retry the failed range later', async () => {
    const source = new ManualSource();
    const errors: TimelineDataError[] = [];
    const loader = new TimelineDataLoader({ onError: (e) => errors.push(e) });
    loader.update(source, i(0, 10), 0);
    source.calls[0].reject(new Error('boom'));
    await settle();
    expect(errors.length).toBe(1);
    expect(errors[0].range.start.value).toBe(0);
    expect(loader.loading()).toBe(false);
    expect(loader.loadedIntervals).toEqual([]);

    loader.update(source, i(0, 10), 0);
    expect(source.calls.length).toBe(2);
  });

  it('should report synchronous errors', () => {
    const errors: TimelineDataError[] = [];
    const loader = new TimelineDataLoader({ onError: (e) => errors.push(e) });
    loader.update(
      {
        getPoints: () => {
          throw new Error('sync');
        },
      },
      i(0, 10),
      0,
    );
    expect(errors.length).toBe(1);
    expect(loader.loading()).toBe(false);
  });

  it('should reset and abort when the source changes', async () => {
    const a = new ManualSource();
    const b = new ManualSource();
    const loader = new TimelineDataLoader();
    loader.update(a, i(0, 10), 0);
    loader.update(a, i(0, 20), 0);
    a.calls[0].resolve(pointsIn(0, 10));
    await settle();
    expect(loader.points().length).toBe(11);

    loader.update(b, i(0, 20), 300);
    expect(a.calls[1].signal.aborted).toBe(true);
    expect(loader.points()).toEqual([]);
    // the new source is loaded immediately, without debounce
    expect(b.ranges).toEqual([[0, 20]]);

    // late results of the old source are ignored
    a.calls[1].resolve(pointsIn(10, 20));
    await settle();
    expect(loader.points()).toEqual([]);
    expect(loader.loading()).toBe(true);
  });

  it('should reload the current target', async () => {
    const source = new ManualSource();
    const loader = new TimelineDataLoader();
    loader.update(source, i(0, 10), 0);
    source.calls[0].resolve(pointsIn(0, 10));
    await settle();

    loader.reload();
    expect(loader.points()).toEqual([]);
    expect(source.ranges).toEqual([
      [0, 10],
      [0, 10],
    ]);
  });

  it('should abort everything on destroy', () => {
    const source = new ManualSource();
    const loader = new TimelineDataLoader();
    loader.update(source, i(0, 10), 0);
    loader.destroy();
    expect(source.calls[0].signal.aborted).toBe(true);
    expect(loader.loading()).toBe(false);
  });

  it('should build ranges with the specified function', () => {
    const source = new ManualSource();
    const loader = new TimelineDataLoader({
      toRange: (x) => ({
        start: { label: `from ${x.start}`, value: x.start },
        end: { label: `to ${x.end}`, value: x.end },
      }),
    });
    loader.update(source, i(1, 2), 0);
    expect(source.calls[0].range.start.label).toBe('from 1');
  });

  describe('with subscribables', () => {
    class StreamSource implements TimelineDataSource {
      public observer?: {
        next?: (value: TimelinePoint[]) => void;
        error?: (error: unknown) => void;
        complete?: () => void;
      };
      public unsubscribed = false;

      public getPoints(): TimelineSubscribable<TimelinePoint[]> {
        return {
          subscribe: (observer) => {
            this.observer = observer;
            return { unsubscribe: () => (this.unsubscribed = true) };
          },
        };
      }
    }

    it('should add each batch as it arrives', () => {
      const source = new StreamSource();
      const loader = new TimelineDataLoader();
      loader.update(source, i(0, 10), 0);
      source.observer!.next!(pointsIn(0, 4));
      expect(loader.points().length).toBe(5);
      expect(loader.loading()).toBe(true);
      source.observer!.next!(pointsIn(5, 10));
      source.observer!.complete!();
      expect(loader.points().length).toBe(11);
      expect(loader.loading()).toBe(false);
      expect(loader.loadedIntervals).toEqual([i(0, 10)]);
    });

    it('should unsubscribe when reset', () => {
      const source = new StreamSource();
      const loader = new TimelineDataLoader();
      loader.update(source, i(0, 10), 0);
      loader.destroy();
      expect(source.unsubscribed).toBe(true);
    });

    it('should keep the points of a failed stream, but not its range', () => {
      const source = new StreamSource();
      const errors: TimelineDataError[] = [];
      const loader = new TimelineDataLoader({ onError: (e) => errors.push(e) });
      loader.update(source, i(0, 10), 0);
      source.observer!.next!(pointsIn(0, 4));
      source.observer!.error!(new Error('broken'));
      expect(loader.points().length).toBe(5);
      expect(loader.loadedIntervals).toEqual([]);
      expect(errors.length).toBe(1);
    });
  });
});
