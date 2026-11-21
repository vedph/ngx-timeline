import { TestBed } from '@angular/core/testing';

import { TimelineColorService } from './timeline-color.service';

describe('TimelineColorService', () => {
  let service: TimelineColorService;

  beforeEach(() => {
    service = TestBed.inject(TimelineColorService);
  });

  it('should leave points without color to the theme', () => {
    const map = service.resolve([{ id: 1, label: 'a', value: 1 }]);
    expect(map.has(1)).toBe(false);
  });

  it('should compute the contrast text color', () => {
    const map = service.resolve([
      { id: 1, label: 'a', value: 1, color: '#000000' },
      { id: 2, label: 'b', value: 2, color: '#ffff00' },
      { id: 3, label: 'c', value: 3, color: 'navy' },
    ]);
    expect(map.get(1)).toEqual({ fill: '#000000', text: 'white' });
    expect(map.get(2)).toEqual({ fill: '#ffff00', text: 'black' });
    expect(map.get(3)).toEqual({ fill: 'navy', text: 'white' });
  });

  it('should keep unresolvable colors without a text color', () => {
    const map = service.resolve([
      { id: 1, label: 'a', value: 1, color: 'var(--x)' },
    ]);
    expect(map.get(1)).toEqual({ fill: 'var(--x)', text: undefined });
  });

  it('should assign distinct, stable auto colors by ID', () => {
    const points = [
      { id: 3, label: 'c', value: 3, color: 'auto' },
      { id: 1, label: 'a', value: 1, color: 'auto' },
      { id: 2, label: 'b', value: 2, color: 'AUTO' },
    ];
    const first = service.resolve(points);
    const second = service.resolve([...points].reverse());
    const fills = [1, 2, 3].map((id) => first.get(id)?.fill);

    expect(new Set(fills).size).toBe(3);
    for (const id of [1, 2, 3]) {
      expect(first.get(id)?.fill).toMatch(/^#[0-9a-f]{6}$/i);
      expect(second.get(id)).toEqual(first.get(id));
    }
  });

  it('should get contrast colors', () => {
    expect(service.getContrastColor('white')).toBe('black');
    expect(service.getContrastColor('#111')).toBe('white');
    expect(service.getContrastColor('transparent')).toBeUndefined();
    expect(service.getContrastColor('nonsense')).toBeUndefined();
  });
});
