import {
  clampInterval,
  getZoomLevel,
  intervalAtZoom,
  intervalsEqual,
  panInterval,
  sliderToZoom,
  zoomInterval,
  zoomToSlider,
} from './timeline-interval';

const total = { start: 0, end: 100 };

describe('timeline-interval', () => {
  describe('clampInterval', () => {
    it('should leave a contained interval unchanged', () => {
      expect(clampInterval({ start: 10, end: 20 }, total)).toEqual({
        start: 10,
        end: 20,
      });
    });

    it('should shift an interval overflowing the end', () => {
      expect(clampInterval({ start: 95, end: 115 }, total)).toEqual({
        start: 80,
        end: 100,
      });
    });

    it('should shift an interval overflowing the start', () => {
      expect(clampInterval({ start: -5, end: 5 }, total)).toEqual({
        start: 0,
        end: 10,
      });
    });

    it('should limit the span to the total span', () => {
      expect(clampInterval({ start: -50, end: 200 }, total)).toEqual(total);
    });

    it('should enforce the minimum span around the center', () => {
      expect(clampInterval({ start: 50, end: 50 }, total, 10)).toEqual({
        start: 45,
        end: 55,
      });
    });

    it('should normalize reversed intervals', () => {
      expect(clampInterval({ start: 30, end: 20 }, total)).toEqual({
        start: 20,
        end: 30,
      });
    });
  });

  describe('zoomInterval', () => {
    it('should zoom in around the anchor', () => {
      const r = zoomInterval({ start: 0, end: 100 }, 2, 50, total);
      expect(r.start).toBeCloseTo(25);
      expect(r.end).toBeCloseTo(75);
    });

    it('should keep the anchor at the same relative position', () => {
      const r = zoomInterval({ start: 0, end: 100 }, 4, 20, total);
      expect(r.start).toBeCloseTo(15);
      expect(r.end).toBeCloseTo(40);
    });

    it('should not zoom out beyond the total range', () => {
      expect(zoomInterval({ start: 40, end: 60 }, 0.01, 50, total)).toEqual(
        total,
      );
    });

    it('should not zoom in beyond the minimum span', () => {
      const r = zoomInterval({ start: 40, end: 60 }, 1000, 50, total, 5);
      expect(r.end - r.start).toBeCloseTo(5);
    });

    it('should ignore invalid factors', () => {
      expect(zoomInterval({ start: 10, end: 20 }, 0, 15, total)).toEqual({
        start: 10,
        end: 20,
      });
    });
  });

  describe('panInterval', () => {
    it('should shift the interval', () => {
      expect(panInterval({ start: 10, end: 20 }, 5, total)).toEqual({
        start: 15,
        end: 25,
      });
    });

    it('should stop at the bounds', () => {
      expect(panInterval({ start: 10, end: 20 }, -50, total)).toEqual({
        start: 0,
        end: 10,
      });
    });
  });

  describe('zoom level and slider', () => {
    it('should compute the zoom level', () => {
      expect(getZoomLevel({ start: 0, end: 25 }, total)).toBe(4);
      expect(getZoomLevel(total, total)).toBe(1);
    });

    it('should round-trip slider positions', () => {
      for (const zoom of [1, 2, 10, 50, 100]) {
        const s = zoomToSlider(zoom, 100, 1000);
        expect(sliderToZoom(s, 100, 1000)).toBeCloseTo(zoom, 0);
      }
      expect(zoomToSlider(1, 100, 1000)).toBe(0);
      expect(zoomToSlider(100, 100, 1000)).toBe(1000);
    });

    it('should get an interval at a zoom level around the view center', () => {
      const r = intervalAtZoom({ start: 40, end: 60 }, 10, total);
      expect(r.start).toBeCloseTo(45);
      expect(r.end).toBeCloseTo(55);
    });
  });

  describe('intervalsEqual', () => {
    it('should compare with a relative tolerance', () => {
      expect(intervalsEqual({ start: 0, end: 1 }, { start: 0, end: 1 + 1e-9 }, 1)).toBe(true);
      expect(intervalsEqual({ start: 0, end: 1 }, { start: 0, end: 1.1 }, 1)).toBe(false);
    });
  });
});
