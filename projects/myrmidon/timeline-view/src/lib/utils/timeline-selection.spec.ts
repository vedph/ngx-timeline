import { TimelinePointWithId } from '../models';
import {
  addToTimelineSelection,
  toggleTimelineSelection,
} from './timeline-selection';

const points: TimelinePointWithId[] = [1, 2, 3, 4, 5].map((n) => ({
  id: n,
  label: `p${n}`,
  value: n * 10,
}));
const [a, b, c, d, e] = points;
const ids = (items: TimelinePointWithId[]) => items.map((p) => p.id);

describe('timeline-selection', () => {
  describe('single', () => {
    it('should select a point', () => {
      expect(ids(toggleTimelineSelection('single', points, [], b))).toEqual([2]);
    });

    it('should replace the selected point', () => {
      expect(ids(toggleTimelineSelection('single', points, [b], d))).toEqual([4]);
    });

    it('should deselect the selected point', () => {
      expect(toggleTimelineSelection('single', points, [b], b)).toEqual([]);
    });
  });

  describe('sparse', () => {
    it('should add points keeping value order', () => {
      expect(ids(toggleTimelineSelection('sparse', points, [d], a))).toEqual([1, 4]);
    });

    it('should remove a selected point', () => {
      expect(ids(toggleTimelineSelection('sparse', points, [a, c, e], c))).toEqual([1, 5]);
    });
  });

  describe('range', () => {
    it('should start a range', () => {
      expect(ids(toggleTimelineSelection('range', points, [], c))).toEqual([3]);
    });

    it('should extend the range up to the clicked point', () => {
      expect(ids(toggleTimelineSelection('range', points, [b], e))).toEqual([2, 3, 4, 5]);
      expect(ids(toggleTimelineSelection('range', points, [d], a))).toEqual([1, 2, 3, 4]);
    });

    it('should shrink the range when clicking its edges', () => {
      expect(ids(toggleTimelineSelection('range', points, [b, c, d], b))).toEqual([3, 4]);
      expect(ids(toggleTimelineSelection('range', points, [b, c, d], d))).toEqual([2, 3]);
    });

    it('should restart from an inner point', () => {
      expect(ids(toggleTimelineSelection('range', points, [b, c, d], c))).toEqual([3]);
    });

    it('should clear a single-point range', () => {
      expect(toggleTimelineSelection('range', points, [c], c)).toEqual([]);
    });

    it('should normalize a non-contiguous selection', () => {
      expect(ids(toggleTimelineSelection('range', points, [a, c], e))).toEqual([1, 2, 3, 4, 5]);
    });
  });

  it('should match the current selection by ID', () => {
    const copy = { ...b };
    expect(toggleTimelineSelection('single', points, [copy], b)).toEqual([]);
  });

  it('should ignore unknown targets', () => {
    const unknown = { id: 99, label: 'x', value: 0 };
    expect(ids(toggleTimelineSelection('sparse', points, [a], unknown))).toEqual([1]);
  });

  describe('addToTimelineSelection', () => {
    it('should add many points in sparse mode', () => {
      expect(ids(addToTimelineSelection('sparse', points, [a], [c, d]))).toEqual([1, 3, 4]);
    });

    it('should span the union in range mode', () => {
      expect(ids(addToTimelineSelection('range', points, [a], [d, e]))).toEqual([1, 2, 3, 4, 5]);
    });

    it('should not select many points in single mode', () => {
      expect(ids(addToTimelineSelection('single', points, [a], [d, e]))).toEqual([1]);
      expect(ids(addToTimelineSelection('single', points, [a], [d]))).toEqual([4]);
    });
  });
});
