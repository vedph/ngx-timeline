import { computeTicks, niceStep } from './timeline-ticks';

describe('timeline-ticks', () => {
  describe('niceStep', () => {
    it('should round up to 1, 2 or 5 times a power of 10', () => {
      expect(niceStep(0.8).step).toBe(1);
      expect(niceStep(1.5).step).toBe(2);
      expect(niceStep(3).step).toBe(5);
      expect(niceStep(7).step).toBe(10);
      expect(niceStep(130).step).toBe(200);
      expect(niceStep(0.03).step).toBeCloseTo(0.05);
    });

    it('should subdivide steps into minor steps', () => {
      expect(niceStep(10).minorStep).toBe(2);
      expect(niceStep(20).minorStep).toBe(5);
      expect(niceStep(50).minorStep).toBe(10);
    });

    it('should force integer steps when requested', () => {
      const r = niceStep(0.3, true);
      expect(r.step).toBe(1);
      expect(r.minorStep).toBe(1);
      expect(niceStep(2, true)).toEqual({ step: 2, minorStep: 1 });
    });

    it('should handle invalid input', () => {
      expect(niceStep(0)).toEqual({ step: 1, minorStep: 1 });
      expect(niceStep(Number.NaN)).toEqual({ step: 1, minorStep: 1 });
    });
  });

  describe('computeTicks', () => {
    it('should generate major and minor ticks', () => {
      const r = computeTicks(0, 100, 5);
      expect(r.step).toBe(20);
      const majors = r.ticks.filter((t) => t.major).map((t) => t.value);
      expect(majors).toEqual([0, 20, 40, 60, 80, 100]);
      expect(r.ticks.length).toBeGreaterThan(majors.length);
    });

    it('should only include ticks inside the interval', () => {
      const r = computeTicks(3, 17, 2);
      expect(r.ticks.every((t) => t.value >= 3 && t.value <= 17)).toBe(true);
    });

    it('should work with negative values', () => {
      const r = computeTicks(-50, 50, 4);
      const majors = r.ticks.filter((t) => t.major).map((t) => t.value);
      // raw step 25 => nice step 50
      expect(majors).toEqual([-50, 0, 50]);
    });

    it('should avoid floating point noise', () => {
      const r = computeTicks(0, 1, 10);
      expect(r.ticks.map((t) => t.value)).toContain(0.3);
    });

    it('should generate integer ticks', () => {
      const r = computeTicks(0, 3, 10, true);
      expect(r.ticks.map((t) => t.value)).toEqual([0, 1, 2, 3]);
    });

    it('should return no ticks for an empty interval', () => {
      expect(computeTicks(5, 5, 5).ticks).toEqual([]);
    });

    it('should drop minor ticks beyond the limit', () => {
      const r = computeTicks(0, 1000, 100, false, 50);
      expect(r.ticks.every((t) => t.major)).toBe(true);
    });
  });
});
