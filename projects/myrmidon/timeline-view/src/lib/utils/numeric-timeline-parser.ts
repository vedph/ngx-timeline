import { TimelineParser, TimelineRange } from '../models';

/**
 * Format a number using a precision suitable for the specified step,
 * without locale-specific grouping, so that the output is always parseable
 * back by `Number()`.
 *
 * @param value The value to format.
 * @param step The resolution (e.g. tick distance). When not specified, up
 * to 6 decimals are used and trailing zeros are dropped.
 * @returns The formatted value.
 */
export function formatTimelineNumber(value: number, step?: number): string {
  if (!Number.isFinite(value)) {
    return String(value);
  }
  let decimals = 6;
  if (step !== undefined && step > 0 && Number.isFinite(step)) {
    decimals = Math.min(10, Math.max(0, Math.ceil(-Math.log10(step) - 1e-9)));
  }
  const s = String(Number(value.toFixed(decimals)));
  return s === '-0' ? '0' : s;
}

/**
 * The default timeline parser: it accepts plain numbers (e.g. `12`, `-3.5`)
 * and returns a zero-width range for them.
 */
export class NumericTimelineParser implements TimelineParser {
  public parse(text: string): TimelineRange | null {
    const t = text?.trim();
    if (!t) {
      return null;
    }
    const value = Number(t);
    if (!Number.isFinite(value)) {
      return null;
    }
    const label = formatTimelineNumber(value);
    return { start: { label, value }, end: { label, value } };
  }

  public format(value: number, step?: number): string {
    return formatTimelineNumber(value, step);
  }
}
