import {
  isCustomTimelineRange,
  lowerBound,
  normalizeTimelinePoints,
  sortTimelinePoints,
  upperBound,
} from './timeline-points';

describe('timeline-points', () => {
  describe('normalizeTimelinePoints', () => {
    it('should assign ordinal IDs to points without ID', () => {
      const r = normalizeTimelinePoints([
        { label: 'a', value: 5 },
        { id: 10, label: 'b', value: 1 },
        { label: 'c', value: 3 },
      ]);
      expect(r.map((p) => p.id)).toEqual([1, 10, 3]);
    });

    it('should not copy points which already have an ID', () => {
      const p = { id: 7, label: 'a', value: 1 };
      expect(normalizeTimelinePoints([p])[0]).toBe(p);
    });

    it('should handle empty input', () => {
      expect(normalizeTimelinePoints(undefined)).toEqual([]);
      expect(normalizeTimelinePoints([])).toEqual([]);
    });
  });

  it('should sort by value and then by ID', () => {
    const r = sortTimelinePoints([
      { id: 3, label: 'c', value: 2 },
      { id: 1, label: 'a', value: 5 },
      { id: 2, label: 'b', value: 2 },
    ]);
    expect(r.map((p) => p.id)).toEqual([2, 3, 1]);
  });

  it('should detect custom ranges', () => {
    const zero = { label: '', value: 0 };
    expect(isCustomTimelineRange({ start: zero, end: zero })).toBe(true);
    expect(isCustomTimelineRange({ start: zero, end: { label: '', value: 1 } })).toBe(false);
  });

  it('should find bounds in sorted arrays', () => {
    const a = [1, 3, 3, 5];
    expect(lowerBound(a, 3)).toBe(1);
    expect(upperBound(a, 3)).toBe(3);
    expect(lowerBound(a, 0)).toBe(0);
    expect(upperBound(a, 9)).toBe(4);
  });
});
