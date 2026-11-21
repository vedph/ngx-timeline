/**
 * A ruler tick, in the same coordinate space of the requested interval.
 */
export interface TimelineTick {
  value: number;
  major: boolean;
}

/**
 * The result of a tick computation.
 */
export interface TimelineTicks {
  ticks: TimelineTick[];
  /** Distance between major ticks. */
  step: number;
  /** Distance between minor ticks. */
  minorStep: number;
}

/**
 * Get a "nice" step (1, 2 or 5 times a power of 10) not smaller than the
 * specified raw step, together with its minor subdivision.
 *
 * @param rawStep The raw step.
 * @param integer True to force integer steps (>= 1).
 */
export function niceStep(
  rawStep: number,
  integer = false,
): { step: number; minorStep: number } {
  if (!(rawStep > 0) || !Number.isFinite(rawStep)) {
    return { step: 1, minorStep: 1 };
  }
  const exp = Math.floor(Math.log10(rawStep));
  const pow = Math.pow(10, exp);
  const f = rawStep / pow;
  const m = f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10;
  let step = m * pow;
  let minorStep = step / (m === 2 ? 4 : 5);
  if (integer) {
    step = Math.max(1, Math.round(step));
    minorStep = Math.max(1, Math.round(minorStep));
    if (step % minorStep !== 0) {
      minorStep = 1;
    }
  }
  return { step, minorStep };
}

function cleanFloat(n: number): number {
  return Number(n.toPrecision(12));
}

/**
 * Compute major and minor ticks for the specified interval.
 *
 * @param start The interval start.
 * @param end The interval end.
 * @param majorCount The approximate count of desired major ticks.
 * @param integer True to only generate integer ticks.
 * @param maxTicks The maximum number of ticks to generate. When minor
 * ticks would exceed it, only major ticks are generated.
 */
export function computeTicks(
  start: number,
  end: number,
  majorCount: number,
  integer = false,
  maxTicks = 1000,
): TimelineTicks {
  const lo = Math.min(start, end);
  const hi = Math.max(start, end);
  const span = hi - lo;
  if (!(span > 0) || !Number.isFinite(span)) {
    return { ticks: [], step: 0, minorStep: 0 };
  }
  const { step, minorStep } = niceStep(span / Math.max(1, majorCount), integer);
  let minor = minorStep;
  if (Math.floor(hi / minor) - Math.ceil(lo / minor) > maxTicks) {
    minor = step;
  }
  const ratio = Math.max(1, Math.round(step / minor));
  const i0 = Math.ceil(lo / minor - 1e-9);
  const i1 = Math.floor(hi / minor + 1e-9);
  const ticks: TimelineTick[] = [];
  for (let i = i0; i <= i1 && ticks.length <= maxTicks; i++) {
    ticks.push({
      value: cleanFloat(i * minor),
      major: ((i % ratio) + ratio) % ratio === 0,
    });
  }
  return { ticks, step, minorStep: minor };
}
