import { getIntervalGaps, mergeIntervals } from './timeline-coverage';

const i = (start: number, end: number) => ({ start, end });

describe('mergeIntervals', () => {
  it('should return an empty list for no intervals', () => {
    expect(mergeIntervals([])).toEqual([]);
  });

  it('should sort disjoint intervals', () => {
    expect(mergeIntervals([i(5, 6), i(1, 2)])).toEqual([i(1, 2), i(5, 6)]);
  });

  it('should merge overlapping and touching intervals', () => {
    expect(mergeIntervals([i(4, 8), i(0, 2), i(2, 5), i(10, 11)])).toEqual([
      i(0, 8),
      i(10, 11),
    ]);
  });

  it('should merge contained intervals', () => {
    expect(mergeIntervals([i(0, 10), i(2, 3)])).toEqual([i(0, 10)]);
  });

  it('should drop invalid intervals', () => {
    expect(mergeIntervals([i(3, 1), i(NaN, 2), i(0, 1)])).toEqual([i(0, 1)]);
  });

  it('should not mutate its input', () => {
    const input = [i(2, 3), i(0, 1)];
    mergeIntervals(input);
    expect(input).toEqual([i(2, 3), i(0, 1)]);
  });
});

describe('getIntervalGaps', () => {
  it('should return the whole target when nothing is covered', () => {
    expect(getIntervalGaps(i(0, 10), [])).toEqual([i(0, 10)]);
  });

  it('should return nothing when the target is covered', () => {
    expect(getIntervalGaps(i(2, 8), [i(0, 5), i(5, 10)])).toEqual([]);
  });

  it('should return the gaps at the edges', () => {
    expect(getIntervalGaps(i(0, 10), [i(3, 7)])).toEqual([i(0, 3), i(7, 10)]);
  });

  it('should return the gaps between covered intervals', () => {
    expect(getIntervalGaps(i(0, 10), [i(6, 8), i(0, 2), i(3, 4)])).toEqual([
      i(2, 3),
      i(4, 6),
      i(8, 10),
    ]);
  });

  it('should ignore covered intervals outside the target', () => {
    expect(getIntervalGaps(i(5, 10), [i(0, 1), i(20, 30)])).toEqual([
      i(5, 10),
    ]);
  });

  it('should ignore gaps not greater than epsilon', () => {
    expect(getIntervalGaps(i(0, 10), [i(0, 4.9999), i(5, 10)], 0.001)).toEqual(
      [],
    );
  });
});
