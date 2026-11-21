import {
  getTierCount,
  layoutTimelineItems,
  TimelineLayoutEntry,
  TimelineLayoutOptions,
} from './timeline-layout';

function entry(a: number, ext = 40): TimelineLayoutEntry<number> {
  return { key: `k${a}`, a, ext, thick: 24, data: a };
}

const base: TimelineLayoutOptions = {
  orientation: 'horizontal',
  sides: ['before'],
  length: 1000,
  axisPos: 200,
  tiers: 1,
  connector: 18,
  tierThickness: 24,
  tierGap: 6,
  itemGap: 6,
  edgeMargin: 2,
  groupSize: () => ({ ext: 30, thick: 24 }),
};

describe('layoutTimelineItems', () => {
  it('should place distant points without grouping', () => {
    const items = layoutTimelineItems([entry(100), entry(300), entry(500)], base);
    expect(items.map((i) => i.kind)).toEqual(['point', 'point', 'point']);
    expect(items[0].box).toEqual({ x: 80, y: 200 - 18 - 24, width: 40, height: 24 });
    expect(items[0].connector).toEqual({ x1: 100, y1: 200, x2: 100, y2: 182 });
  });

  it('should group overlapping points when there is a single tier', () => {
    const items = layoutTimelineItems([entry(100), entry(110), entry(120), entry(400)], base);
    expect(items.length).toBe(2);
    expect(items[0].kind).toBe('group');
    expect(items[0].members.map((m) => m.data)).toEqual([100, 110, 120]);
    expect(items[0].spanStart).toBe(100);
    expect(items[0].spanEnd).toBe(120);
    expect(items[0].anchor).toBe(110);
    expect(items[0].bracket).toEqual({ x1: 100, y1: 200, x2: 120, y2: 200 });
    expect(items[1].kind).toBe('point');
  });

  it('should use further tiers before grouping', () => {
    const items = layoutTimelineItems([entry(100), entry(110), entry(120)], {
      ...base,
      tiers: 3,
    });
    expect(items.map((i) => i.kind)).toEqual(['point', 'point', 'point']);
    expect(items.map((i) => i.tier)).toEqual([0, 1, 2]);
    // tier 1 box is farther from the axis
    expect(items[1].box.y).toBe(200 - 18 - 30 - 24);
  });

  it('should alternate sides', () => {
    const items = layoutTimelineItems([entry(100), entry(300), entry(500)], {
      ...base,
      sides: ['before', 'after'],
    });
    expect(items.map((i) => i.side)).toEqual(['before', 'after', 'before']);
    expect(items[1].box.y).toBe(200 + 18);
  });

  it('should use the other side to avoid overlaps', () => {
    const items = layoutTimelineItems([entry(100), entry(110)], {
      ...base,
      sides: ['before', 'after'],
    });
    expect(items.map((i) => i.kind)).toEqual(['point', 'point']);
    expect(items.map((i) => i.side)).toEqual(['before', 'after']);
  });

  it('should keep boxes inside the axis length', () => {
    const items = layoutTimelineItems([entry(5, 60)], base);
    expect(items[0].box.x).toBe(2);
    // the connector still starts at the true position
    expect(items[0].connector.x1).toBe(5);
  });

  it('should lay out vertically', () => {
    const items = layoutTimelineItems(
      [{ key: 'a', a: 100, ext: 24, thick: 80, data: 0 }],
      { ...base, orientation: 'vertical', sides: ['after'], tierThickness: 80 },
    );
    expect(items[0].box).toEqual({ x: 218, y: 88, width: 80, height: 24 });
    expect(items[0].connector).toEqual({ x1: 200, y1: 100, x2: 218, y2: 100 });
  });

  it('should return no items for no entries', () => {
    expect(layoutTimelineItems([], base)).toEqual([]);
  });
});

describe('getTierCount', () => {
  it('should count the tiers fitting the space', () => {
    // (130 - 18 + 6) / 30 = 3.9
    expect(getTierCount(130, 18, 24, 6, 8)).toBe(3);
  });

  it('should return at least 1 tier', () => {
    expect(getTierCount(0, 18, 24, 6, 8)).toBe(1);
  });

  it('should honor the maximum', () => {
    expect(getTierCount(10000, 18, 24, 6, 4)).toBe(4);
  });
});
