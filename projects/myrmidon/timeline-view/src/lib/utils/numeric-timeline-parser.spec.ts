import {
  formatTimelineNumber,
  NumericTimelineParser,
} from './numeric-timeline-parser';

describe('NumericTimelineParser', () => {
  const parser = new NumericTimelineParser();

  it('should parse numbers into zero-width ranges', () => {
    expect(parser.parse(' 12.5 ')).toEqual({
      start: { label: '12.5', value: 12.5 },
      end: { label: '12.5', value: 12.5 },
    });
    expect(parser.parse('-3')?.start.value).toBe(-3);
  });

  it('should reject invalid text', () => {
    expect(parser.parse('')).toBeNull();
    expect(parser.parse('   ')).toBeNull();
    expect(parser.parse('abc')).toBeNull();
    expect(parser.parse('Infinity')).toBeNull();
  });

  it('should format values parseably', () => {
    const text = parser.format(1234.5678, 0.01);
    expect(text).toBe('1234.57');
    expect(parser.parse(text)?.start.value).toBe(1234.57);
  });
});

describe('formatTimelineNumber', () => {
  it('should choose decimals from the step', () => {
    expect(formatTimelineNumber(12.345, 1)).toBe('12');
    expect(formatTimelineNumber(12.345, 0.1)).toBe('12.3');
    expect(formatTimelineNumber(12.346, 0.05)).toBe('12.35');
    expect(formatTimelineNumber(1500, 100)).toBe('1500');
  });

  it('should drop trailing zeros and negative zero', () => {
    expect(formatTimelineNumber(2.5)).toBe('2.5');
    expect(formatTimelineNumber(-0.0001, 1)).toBe('0');
  });
});
