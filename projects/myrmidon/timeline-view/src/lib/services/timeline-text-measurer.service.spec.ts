import { TestBed } from '@angular/core/testing';

import { TimelineTextMeasurer } from './timeline-text-measurer.service';

describe('TimelineTextMeasurer', () => {
  let service: TimelineTextMeasurer;

  beforeEach(() => {
    service = TestBed.inject(TimelineTextMeasurer);
  });

  it('should measure longer text as wider', () => {
    const short = service.measure('abc', 12);
    const long = service.measure('abcdef', 12);
    expect(short).toBeGreaterThan(0);
    expect(long).toBeGreaterThan(short);
  });

  it('should measure empty text as 0', () => {
    expect(service.measure('', 12)).toBe(0);
  });

  it('should scale with the font size', () => {
    expect(service.measure('abc', 24)).toBeGreaterThan(service.measure('abc', 12));
  });

  it('should not truncate text which fits', () => {
    const w = service.measure('hello', 12);
    expect(service.truncate('hello', w + 1, 12)).toEqual({ text: 'hello', width: w });
  });

  it('should truncate text with an ellipsis', () => {
    const max = service.measure('hello', 12);
    const r = service.truncate('hello world, how are you?', max, 12);
    expect(r.text.endsWith('…')).toBe(true);
    expect(r.text.length).toBeLessThan(25);
    expect(r.width).toBeLessThanOrEqual(max);
  });
});
