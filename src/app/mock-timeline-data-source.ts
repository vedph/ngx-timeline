import {
  lowerBound,
  TimelineDataSource,
  TimelinePoint,
  TimelineRange,
  upperBound,
} from '@myrmidon/timeline-view';

/**
 * Information about a request served by the mock data source.
 */
export interface MockRequestInfo {
  range: TimelineRange;
  outcome: 'ok' | 'aborted' | 'failed';
  count: number;
  ms: number;
}

/**
 * Options for the mock data source.
 */
export interface MockTimelineDataSourceOptions {
  /** The number of points in the simulated database. */
  count: number;
  /** The minimum value of the points. */
  start: number;
  /** The maximum value of the points. */
  end: number;
  /** The random seed. */
  seed?: number;
  /** Get the simulated latency in milliseconds. */
  latency?: () => number;
  /** Get the probability (0-1) that a request fails. */
  failureRate?: () => number;
  /** Format a value for the tooltips. */
  format?: (value: number) => string;
  /** Called when a request is served, aborted or failed. */
  onRequest?: (info: MockRequestInfo) => void;
}

const KINDS = [
  'Battle',
  'Treaty',
  'Council',
  'Founding',
  'Charter',
  'Eclipse',
  'Expedition',
  'Revolt',
  'Coronation',
  'Discovery',
];

/** A small deterministic pseudo-random generator (mulberry32). */
function random(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * A mock data source simulating a remote service which serves the points
 * of a large timeline on demand. It holds all the points in memory, sorted
 * by value, and answers each request after a simulated latency. It honors
 * the abort signal, as a real HTTP-based source should.
 */
export class MockTimelineDataSource implements TimelineDataSource {
  private readonly _points: TimelinePoint[];
  private readonly _values: number[];

  constructor(private readonly _options: MockTimelineDataSourceOptions) {
    const rnd = random(_options.seed ?? 1);
    const { count, start, end } = _options;
    const format = _options.format ?? String;
    const values = Array.from(
      { length: count },
      () => Math.round((start + rnd() * (end - start)) * 10) / 10,
    ).sort((a, b) => a - b);
    this._points = values.map((value, i) => {
      const kind = KINDS[Math.floor(rnd() * KINDS.length)];
      return {
        // IDs must be unique and stable
        id: i + 1,
        label: `${kind} ${i + 1}`,
        value,
        tip: `${format(value)}: simulated ${kind.toLowerCase()}`,
        color: 'auto',
        shape: i % 5 === 0 ? 'oval' : 'rectangle',
      };
    });
    this._values = values;
  }

  /** The total number of points in the simulated database. */
  public get count(): number {
    return this._points.length;
  }

  public getPoints(
    range: TimelineRange,
    signal: AbortSignal,
  ): Promise<TimelinePoint[]> {
    const started = Date.now();
    const latency = Math.max(0, this._options.latency?.() ?? 500);
    // add some jitter, as real networks do
    const ms = Math.round(latency * (0.75 + Math.random() * 0.5));
    const report = (outcome: MockRequestInfo['outcome'], count = 0) =>
      this._options.onRequest?.({
        range,
        outcome,
        count,
        ms: Date.now() - started,
      });

    return new Promise((resolve, reject) => {
      if (signal.aborted) {
        report('aborted');
        reject(signal.reason);
        return;
      }
      const onAbort = () => {
        clearTimeout(timer);
        report('aborted');
        reject(signal.reason);
      };
      const timer = setTimeout(() => {
        signal.removeEventListener('abort', onAbort);
        if (Math.random() < (this._options.failureRate?.() ?? 0)) {
          report('failed');
          reject(new Error('Simulated network error'));
          return;
        }
        const i0 = lowerBound(this._values, range.start.value);
        const i1 = upperBound(this._values, range.end.value);
        const points = this._points.slice(i0, i1);
        report('ok', points.length);
        resolve(points);
      }, ms);
      signal.addEventListener('abort', onAbort, { once: true });
    });
  }
}
