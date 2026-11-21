/**
 * When a value matches more than one point (duplicate values) in fixed-step
 * mode, `low` picks the first slot, `high` the last one.
 */
export type ProjectionBias = 'low' | 'high';

/**
 * A projection between timeline values and the internal continuous
 * coordinate (U) used for zooming and scrolling.
 *
 * - linear projection: U = value. Points are placed proportionally to their
 *   value.
 * - fixed-step projection: each point occupies an ordinal slot (U = 0, 1, 2...)
 *   and values in between are linearly interpolated between the neighbor
 *   points. Values outside the points are extrapolated using the average
 *   distance between points. This keeps all the public APIs (view range,
 *   presets, highlights) expressed in values, whatever the mode.
 */
export class TimelineProjection {
  private readonly _step: number;

  private constructor(private readonly _knots: readonly number[] | null) {
    const k = _knots;
    this._step =
      k && k.length > 1 ? (k[k.length - 1] - k[0]) / (k.length - 1) || 1 : 1;
  }

  /**
   * Create a linear projection (U = value).
   */
  public static linear(): TimelineProjection {
    return new TimelineProjection(null);
  }

  /**
   * Create a fixed-step projection from the values of the points.
   *
   * @param sortedValues The points values, sorted in ascending order.
   * If empty, the projection is linear.
   */
  public static fixed(sortedValues: readonly number[]): TimelineProjection {
    return new TimelineProjection(sortedValues.length ? [...sortedValues] : null);
  }

  /**
   * True if this is a fixed-step projection.
   */
  public get isFixed(): boolean {
    return this._knots !== null;
  }

  /**
   * Convert a value into U.
   */
  public toU(value: number, bias: ProjectionBias = 'low'): number {
    const k = this._knots;
    if (!k) {
      return value;
    }
    const n = k.length;
    if (value < k[0]) {
      return (value - k[0]) / this._step;
    }
    if (value > k[n - 1]) {
      return n - 1 + (value - k[n - 1]) / this._step;
    }
    // lower bound: first index with k[i] >= value
    let lo = 0;
    let hi = n;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (k[mid] < value) {
        lo = mid + 1;
      } else {
        hi = mid;
      }
    }
    if (k[lo] === value) {
      if (bias === 'high') {
        let i = lo;
        while (i + 1 < n && k[i + 1] === value) {
          i++;
        }
        return i;
      }
      return lo;
    }
    const i = lo - 1;
    return i + (value - k[i]) / (k[lo] - k[i]);
  }

  /**
   * Convert U into a value.
   */
  public toValue(u: number): number {
    const k = this._knots;
    if (!k) {
      return u;
    }
    const n = k.length;
    if (u <= 0) {
      return k[0] + u * this._step;
    }
    if (u >= n - 1) {
      return k[n - 1] + (u - (n - 1)) * this._step;
    }
    const i = Math.floor(u);
    return k[i] + (u - i) * (k[i + 1] - k[i]);
  }
}
