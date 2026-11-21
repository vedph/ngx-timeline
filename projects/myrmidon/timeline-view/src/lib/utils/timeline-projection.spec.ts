import { TimelineProjection } from './timeline-projection';

describe('TimelineProjection', () => {
  describe('linear', () => {
    const p = TimelineProjection.linear();

    it('should be identity', () => {
      expect(p.isFixed).toBe(false);
      expect(p.toU(12.5)).toBe(12.5);
      expect(p.toValue(-3)).toBe(-3);
    });
  });

  describe('fixed', () => {
    const p = TimelineProjection.fixed([10, 20, 40, 100]);

    it('should map point values to ordinal slots', () => {
      expect(p.isFixed).toBe(true);
      expect(p.toU(10)).toBe(0);
      expect(p.toU(20)).toBe(1);
      expect(p.toU(40)).toBe(2);
      expect(p.toU(100)).toBe(3);
    });

    it('should interpolate between points', () => {
      expect(p.toU(30)).toBeCloseTo(1.5);
      expect(p.toU(70)).toBeCloseTo(2.5);
      expect(p.toValue(1.5)).toBeCloseTo(30);
      expect(p.toValue(2.5)).toBeCloseTo(70);
    });

    it('should extrapolate using the average step', () => {
      // average step = (100 - 10) / 3 = 30
      expect(p.toU(-20)).toBeCloseTo(-1);
      expect(p.toU(130)).toBeCloseTo(4);
      expect(p.toValue(-1)).toBeCloseTo(-20);
      expect(p.toValue(4)).toBeCloseTo(130);
    });

    it('should round-trip values', () => {
      for (const v of [-50, 10, 15, 33, 99, 250]) {
        expect(p.toValue(p.toU(v))).toBeCloseTo(v);
      }
    });

    it('should honor bias with duplicate values', () => {
      const d = TimelineProjection.fixed([1, 5, 5, 5, 9]);
      expect(d.toU(5, 'low')).toBe(1);
      expect(d.toU(5, 'high')).toBe(3);
      expect(d.toValue(2)).toBe(5);
    });

    it('should fall back to linear when there are no points', () => {
      const e = TimelineProjection.fixed([]);
      expect(e.isFixed).toBe(false);
      expect(e.toU(7)).toBe(7);
    });

    it('should use a unit step with a single point', () => {
      const s = TimelineProjection.fixed([50]);
      expect(s.toU(50)).toBe(0);
      expect(s.toU(52)).toBe(2);
    });
  });
});
