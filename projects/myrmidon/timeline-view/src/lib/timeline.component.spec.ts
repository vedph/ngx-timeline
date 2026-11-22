import { inputBinding, outputBinding } from '@angular/core';
import { fireEvent, render, screen, within } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';

import {
  DecoratedTimelineRange,
  TimelineDataSource,
  TimelineParser,
  TimelinePoint,
  TimelineRange,
} from './models';
import { TimelineComponent } from './timeline.component';

const POINTS: TimelinePoint[] = [
  { label: 'Alpha', value: 0 },
  { label: 'Beta', value: 25 },
  { label: 'Gamma', value: 50 },
  { label: 'Delta', value: 75 },
  { label: 'Epsilon', value: 100, tip: 'the last one' },
];

function range(start: number, end: number): TimelineRange {
  return {
    start: { label: String(start), value: start },
    end: { label: String(end), value: end },
  };
}

function lastRange(spy: ReturnType<typeof vi.fn>): TimelineRange {
  return spy.mock.calls[spy.mock.calls.length - 1][0] as TimelineRange;
}

async function setup(inputs: Partial<Record<string, unknown>> = {}) {
  const selectionChange = vi.fn();
  const viewRangeChange = vi.fn();
  const values: Record<string, unknown> = { points: POINTS, ...inputs };
  const result = await render(TimelineComponent, {
    bindings: [
      ...Object.entries(values).map(([name, value]) =>
        inputBinding(name, () => value),
      ),
      outputBinding('selectionChange', selectionChange),
      outputBinding('viewRangeChange', viewRangeChange),
    ],
  });
  return {
    ...result,
    selectionChange,
    viewRangeChange,
    user: userEvent.setup(),
    plot: () => screen.getByRole('group', { name: 'Timeline' }),
  };
}

describe('TimelineComponent', () => {
  describe('rendering', () => {
    it('should render every point as a toggle button', async () => {
      await setup();
      for (const label of ['Alpha', 'Beta', 'Gamma', 'Delta']) {
        expect(
          screen.getByRole('button', { name: label, pressed: false }),
        ).toBeTruthy();
      }
      // the tip is part of the accessible name
      expect(
        screen.getByRole('button', { name: 'Epsilon: the last one' }),
      ).toBeTruthy();
    });

    it('should not render scroll buttons when the whole range is visible', async () => {
      await setup();
      expect(screen.queryByRole('button', { name: /scroll/i })).toBeNull();
    });

    it('should display the view range in the toolbar', async () => {
      await setup();
      expect(screen.getByText('0 – 100')).toBeTruthy();
    });

    it('should render the ruler tick labels', async () => {
      await setup({ ruler: true });
      expect(screen.getByText('40')).toBeTruthy();
      expect(screen.getByText('80')).toBeTruthy();
    });

    it('should render highlighted range labels', async () => {
      const hilite: DecoratedTimelineRange = {
        ...range(25, 50),
        label: 'Golden age',
        color: 'gold',
      };
      await setup({ hiliteRanges: [hilite] });
      expect(screen.getByText('Golden age')).toBeTruthy();
    });

    it('should only render the points inside the view range', async () => {
      await setup({ viewRange: range(40, 60) });
      expect(screen.getByRole('button', { name: 'Gamma' })).toBeTruthy();
      expect(screen.queryByRole('button', { name: 'Alpha' })).toBeNull();
      expect(screen.queryByRole('button', { name: 'Delta' })).toBeNull();
    });

    it('should group points which would overlap', async () => {
      const crowded = Array.from({ length: 30 }, (_, i) => ({
        label: `Point ${i + 1}`,
        value: i,
      }));
      await setup({ points: [...crowded, { label: 'Far', value: 1000 }] });
      expect(
        screen.getAllByRole('button', { name: /^Group of \d+ points/ }).length,
      ).toBeGreaterThan(0);
      expect(screen.getByRole('button', { name: 'Far' })).toBeTruthy();
    });

    it('should hide the toolbar when requested', async () => {
      await setup({ toolbar: false });
      expect(screen.queryByRole('button', { name: /clear selection/i })).toBeNull();
    });
  });

  describe('selection', () => {
    it('should select a point when clicked, assigning ordinal IDs', async () => {
      const { user, selectionChange } = await setup();
      await user.click(screen.getByRole('button', { name: 'Beta' }));

      expect(selectionChange).toHaveBeenLastCalledWith([
        expect.objectContaining({ id: 2, label: 'Beta' }),
      ]);
      expect(
        await screen.findByRole('button', { name: 'Beta', pressed: true }),
      ).toBeTruthy();
    });

    it('should replace the selection in single mode', async () => {
      const { user, selectionChange } = await setup();
      await user.click(screen.getByRole('button', { name: 'Beta' }));
      await user.click(screen.getByRole('button', { name: 'Delta' }));

      expect(selectionChange).toHaveBeenLastCalledWith([
        expect.objectContaining({ label: 'Delta' }),
      ]);
      expect(screen.getByRole('button', { name: 'Beta', pressed: false })).toBeTruthy();
    });

    it('should deselect a selected point when clicked again', async () => {
      const { user, selectionChange } = await setup();
      const beta = screen.getByRole('button', { name: 'Beta' });
      await user.click(beta);
      await user.click(beta);
      expect(selectionChange).toHaveBeenLastCalledWith([]);
    });

    it('should toggle many points in sparse mode', async () => {
      const { user, selectionChange } = await setup({ selectionMode: 'sparse' });
      await user.click(screen.getByRole('button', { name: 'Delta' }));
      await user.click(screen.getByRole('button', { name: 'Alpha' }));

      const labels = selectionChange.mock.lastCall![0].map((p: TimelinePoint) => p.label);
      expect(labels).toEqual(['Alpha', 'Delta']);
    });

    it('should select contiguous points in range mode', async () => {
      const { user, selectionChange } = await setup({ selectionMode: 'range' });
      await user.click(screen.getByRole('button', { name: 'Beta' }));
      await user.click(screen.getByRole('button', { name: 'Delta' }));

      const labels = selectionChange.mock.lastCall![0].map((p: TimelinePoint) => p.label);
      expect(labels).toEqual(['Beta', 'Gamma', 'Delta']);
      expect(screen.getByRole('button', { name: 'Gamma', pressed: true })).toBeTruthy();
    });

    it('should reflect the bound selection', async () => {
      await setup({ selection: [{ id: 3, label: 'Gamma', value: 50 }] });
      expect(screen.getByRole('button', { name: 'Gamma', pressed: true })).toBeTruthy();
      expect(screen.getByText('1', { selector: '.tm-badge' })).toBeTruthy();
    });

    it('should clear the selection from the toolbar', async () => {
      const { user, selectionChange } = await setup({ selectionMode: 'sparse' });
      await user.click(screen.getByRole('button', { name: 'Alpha' }));
      await user.click(screen.getByRole('button', { name: 'Beta' }));
      await user.click(screen.getByRole('button', { name: /clear selection/i }));

      expect(selectionChange).toHaveBeenLastCalledWith([]);
      expect(screen.getByRole('button', { name: 'Alpha', pressed: false })).toBeTruthy();
    });
  });

  describe('zoom', () => {
    it('should zoom with the slider and reset the zoom', async () => {
      const { user, viewRangeChange } = await setup();
      const slider = screen.getByRole('slider', { name: 'Zoom' });
      fireEvent.input(slider, { target: { value: '500' } });

      const zoomed = lastRange(viewRangeChange);
      expect(zoomed.end.value - zoomed.start.value).toBeLessThan(100);
      // zooming keeps the view centered
      expect((zoomed.start.value + zoomed.end.value) / 2).toBeCloseTo(50);

      await user.click(screen.getByRole('button', { name: 'Reset zoom' }));
      const reset = lastRange(viewRangeChange);
      expect(reset.start.value).toBe(0);
      expect(reset.end.value).toBe(100);
    });

    it('should zoom with the mouse wheel', async () => {
      const { plot, viewRangeChange } = await setup();
      fireEvent.wheel(plot(), { deltaY: -200 });
      const zoomedIn = lastRange(viewRangeChange);
      expect(zoomedIn.end.value - zoomedIn.start.value).toBeLessThan(100);

      fireEvent.wheel(plot(), { deltaY: 100 });
      const zoomedOut = lastRange(viewRangeChange);
      expect(zoomedOut.end.value - zoomedOut.start.value).toBeGreaterThan(
        zoomedIn.end.value - zoomedIn.start.value,
      );
    });

    it('should zoom with trackpad pinch (ctrl+wheel)', async () => {
      const { plot, viewRangeChange } = await setup();
      fireEvent.wheel(plot(), { deltaY: -200, ctrlKey: true });
      const r = lastRange(viewRangeChange);
      expect(r.end.value - r.start.value).toBeLessThan(100);
    });

    it('should not zoom out beyond the timeline range', async () => {
      const { plot, viewRangeChange } = await setup();
      fireEvent.wheel(plot(), { deltaY: 500 });
      expect(viewRangeChange).not.toHaveBeenCalled();
    });

    it('should zoom into a group when it is clicked', async () => {
      const crowded = Array.from({ length: 30 }, (_, i) => ({
        label: `Point ${i + 1}`,
        value: i,
      }));
      const { user, viewRangeChange } = await setup({
        points: [...crowded, { label: 'Far', value: 1000 }],
      });
      const group = screen.getAllByRole('button', { name: /^Group of/ })[0];
      await user.click(group);

      const r = lastRange(viewRangeChange);
      expect(r.end.value - r.start.value).toBeLessThan(100);
    });
  });

  describe('scrolling', () => {
    it('should scroll forward with the scroll button', async () => {
      const { user, viewRangeChange } = await setup({ viewRange: range(0, 50) });
      expect(screen.queryByRole('button', { name: 'Scroll left' })).toBeNull();
      await user.click(screen.getByRole('button', { name: 'Scroll right' }));

      const r = lastRange(viewRangeChange);
      expect(r.start.value).toBeCloseTo(12.5);
      expect(r.end.value).toBeCloseTo(62.5);
      expect(await screen.findByRole('button', { name: 'Scroll left' })).toBeTruthy();
    });

    it('should invert the scroll direction when sorted descending', async () => {
      const { user, viewRangeChange } = await setup({
        viewRange: range(0, 50),
        sort: 'descending',
      });
      expect(screen.queryByRole('button', { name: 'Scroll right' })).toBeNull();
      await user.click(screen.getByRole('button', { name: 'Scroll left' }));
      expect(lastRange(viewRangeChange).start.value).toBeCloseTo(12.5);
    });

    it('should use vertical labels when vertical', async () => {
      await setup({ viewRange: range(50, 100), orientation: 'vertical' });
      expect(screen.getByRole('button', { name: 'Scroll up' })).toBeTruthy();
      expect(screen.queryByRole('button', { name: 'Scroll down' })).toBeNull();
    });

    it('should scroll with shift+wheel', async () => {
      const { plot, viewRangeChange } = await setup({ viewRange: range(0, 50) });
      fireEvent.wheel(plot(), { deltaY: 100, shiftKey: true });
      const r = lastRange(viewRangeChange);
      expect(r.start.value).toBeGreaterThan(0);
      // the span is unchanged
      expect(r.end.value - r.start.value).toBeCloseTo(50);
    });

    it('should scroll with horizontal wheel deltas', async () => {
      const { plot, viewRangeChange } = await setup({ viewRange: range(0, 50) });
      fireEvent.wheel(plot(), { deltaX: 100, deltaY: 5 });
      const r = lastRange(viewRangeChange);
      expect(r.start.value).toBeGreaterThan(0);
      expect(r.end.value - r.start.value).toBeCloseTo(50);
    });

    it('should not scroll beyond the timeline range', async () => {
      const { plot, viewRangeChange } = await setup({ viewRange: range(0, 50) });
      fireEvent.wheel(plot(), { deltaY: -100, shiftKey: true });
      expect(viewRangeChange).not.toHaveBeenCalled();
    });

    it('should scroll with the arrow keys', async () => {
      const { user, viewRangeChange } = await setup({ viewRange: range(0, 50) });
      await user.tab();
      await user.keyboard('{ArrowRight}');
      let r = lastRange(viewRangeChange);
      expect(r.start.value).toBeCloseTo(5);
      expect(r.end.value).toBeCloseTo(55);

      await user.keyboard('{ArrowLeft}');
      r = lastRange(viewRangeChange);
      expect(r.start.value).toBeCloseTo(0);
    });

    it('should scroll with the arrow keys when sorted descending', async () => {
      const { user, viewRangeChange } = await setup({
        viewRange: range(0, 50),
        sort: 'descending',
      });
      await user.tab();
      // left goes toward higher values
      await user.keyboard('{ArrowLeft}');
      expect(lastRange(viewRangeChange).start.value).toBeCloseTo(5);
    });

    it('should scroll in fixed step mode by slots, not by values', async () => {
      const { user, viewRangeChange } = await setup({
        points: [
          { label: 'A', value: 0 },
          { label: 'B', value: 10 },
          { label: 'C', value: 1000 },
        ],
        fixedStep: true,
        viewRange: range(0, 10),
      });
      await user.click(screen.getByRole('button', { name: 'Scroll right' }));
      const r = lastRange(viewRangeChange);
      // a quarter of the B-C slot
      expect(r.end.value).toBeCloseTo(10 + 0.25 * 990);
    });

    it('should honor an explicit timeline range', async () => {
      const { user, viewRangeChange } = await setup({
        timelineRange: range(-100, 200),
        viewRange: range(150, 200),
      });
      await user.click(screen.getByRole('button', { name: 'Scroll left' }));
      expect(lastRange(viewRangeChange).start.value).toBeCloseTo(137.5);
    });
  });

  describe('preset ranges', () => {
    const presets: DecoratedTimelineRange[] = [
      { ...range(0, 50), label: 'First half' },
      { ...range(0, 0), label: 'Custom…' },
    ];

    it('should set the view range when a preset is picked', async () => {
      const { user, viewRangeChange } = await setup({ presetRanges: presets });
      await user.selectOptions(
        screen.getByRole('combobox', { name: 'Range' }),
        'First half',
      );
      const r = lastRange(viewRangeChange);
      expect(r.start.value).toBe(0);
      expect(r.end.value).toBe(50);
    });

    it('should let users type a custom range', async () => {
      const { user, viewRangeChange } = await setup({ presetRanges: presets });
      await user.selectOptions(
        screen.getByRole('combobox', { name: 'Range' }),
        'Custom…',
      );
      const from = await screen.findByRole('textbox', { name: 'From' });
      const to = screen.getByRole('textbox', { name: 'To' });
      await user.clear(from);
      await user.type(from, '20');
      await user.clear(to);
      await user.type(to, '40');
      await user.click(screen.getByRole('button', { name: 'Apply' }));

      const r = lastRange(viewRangeChange);
      expect(r.start.value).toBe(20);
      expect(r.end.value).toBe(40);
    });

    it('should use the parser for the custom range', async () => {
      const parser: TimelineParser = {
        parse: (t) =>
          t === 'early' ? range(0, 10) : t === 'late' ? range(90, 100) : null,
      };
      const { user, viewRangeChange } = await setup({
        presetRanges: presets,
        parser,
      });
      await user.selectOptions(
        screen.getByRole('combobox', { name: 'Range' }),
        'Custom…',
      );
      const from = await screen.findByRole('textbox', { name: 'From' });
      const to = screen.getByRole('textbox', { name: 'To' });
      await user.clear(from);
      await user.type(from, 'nonsense');
      await user.tab();
      expect(await screen.findByText('Invalid value')).toBeTruthy();

      await user.clear(from);
      await user.type(from, 'early');
      await user.clear(to);
      await user.type(to, 'late');
      await user.click(screen.getByRole('button', { name: 'Apply' }));

      const r = lastRange(viewRangeChange);
      expect(r.start.value).toBe(0);
      expect(r.end.value).toBe(100);
    });
  });

  describe('keyboard', () => {
    it('should move between points with ctrl+arrows and select with Enter', async () => {
      const { user, selectionChange, viewRangeChange } = await setup();
      await user.tab();
      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Alpha' }));

      await user.keyboard('{Control>}{ArrowRight}{/Control}');
      expect(viewRangeChange).not.toHaveBeenCalled();
      const beta = screen.getByRole('button', { name: 'Beta' });
      expect(document.activeElement).toBe(beta);

      await user.keyboard('{Enter}');
      expect(selectionChange).toHaveBeenLastCalledWith([
        expect.objectContaining({ label: 'Beta' }),
      ]);

      await user.keyboard('{End}');
      expect(document.activeElement).toBe(
        screen.getByRole('button', { name: /^Epsilon/ }),
      );
    });

    it('should have a single tab stop for the points', async () => {
      await setup();
      const plot = screen.getByRole('group', { name: 'Timeline' });
      const tabStops = within(plot)
        .getAllByRole('button')
        .filter((b) => b.getAttribute('tabindex') === '0');
      expect(tabStops.length).toBe(1);
    });

    it('should zoom with the plus and minus keys', async () => {
      const { user, viewRangeChange } = await setup();
      await user.tab();
      await user.keyboard('+');
      const r = lastRange(viewRangeChange);
      expect(r.end.value - r.start.value).toBeLessThan(100);
      await user.keyboard('0');
      expect(lastRange(viewRangeChange).end.value).toBe(100);
    });
  });

  describe('virtual data', () => {
    /** A source with a point every 10 units, resolved on demand. */
    class TestSource implements TimelineDataSource {
      public readonly requests: [number, number][] = [];
      private readonly _resolvers: (() => void)[] = [];
      public auto = true;
      public fail = false;

      public getPoints(range: TimelineRange): Promise<TimelinePoint[]> {
        const { value: start } = range.start;
        const { value: end } = range.end;
        this.requests.push([start, end]);
        const points: TimelinePoint[] = [];
        for (let v = Math.ceil(start / 10) * 10; v <= end; v += 10) {
          points.push({ id: v + 1, label: `V${v}`, value: v });
        }
        if (this.fail) {
          return Promise.reject(new Error('unavailable'));
        }
        if (this.auto) {
          return Promise.resolve(points);
        }
        return new Promise((resolve) =>
          this._resolvers.push(() => resolve(points)),
        );
      }

      public resolveAll(): void {
        this._resolvers.splice(0).forEach((r) => r());
      }
    }

    async function setupVirtual(
      source: TestSource,
      inputs: Partial<Record<string, unknown>> = {},
    ) {
      const loadError = vi.fn();
      const viewRangeChange = vi.fn();
      const values: Record<string, unknown> = {
        points: POINTS,
        dataSource: source,
        timelineRange: range(0, 1000),
        viewRange: range(100, 200),
        loadDebounce: 0,
        loadMargin: 0,
        ...inputs,
      };
      const result = await render(TimelineComponent, {
        bindings: [
          ...Object.entries(values).map(([name, value]) =>
            inputBinding(name, () => value),
          ),
          outputBinding('loadError', loadError),
          outputBinding('viewRangeChange', viewRangeChange),
        ],
      });
      return { ...result, loadError, viewRangeChange, user: userEvent.setup() };
    }

    it('should load and render the points of the view', async () => {
      const source = new TestSource();
      await setupVirtual(source);
      expect(source.requests).toEqual([[100, 200]]);
      expect(await screen.findByRole('button', { name: 'V150' })).toBeTruthy();
      // the points input is ignored
      expect(screen.queryByRole('button', { name: 'Alpha' })).toBeNull();
    });

    it('should load a margin around the view', async () => {
      const source = new TestSource();
      await setupVirtual(source, { loadMargin: 0.5 });
      expect(source.requests).toEqual([[50, 250]]);
    });

    it('should show a progress bar while loading', async () => {
      const source = new TestSource();
      source.auto = false;
      const { fixture } = await setupVirtual(source);
      const bar = screen.getByRole('progressbar', { name: 'Loading points' });
      expect(bar).toBeTruthy();
      expect(
        screen.getByRole('group', { name: 'Timeline' }).getAttribute('aria-busy'),
      ).toBe('true');

      source.resolveAll();
      await fixture.whenStable();
      expect(screen.queryByRole('progressbar')).toBeNull();
      expect(screen.getByRole('button', { name: 'V150' })).toBeTruthy();
    });

    it('should load only the missing range when scrolling', async () => {
      const source = new TestSource();
      const { user } = await setupVirtual(source);
      await screen.findByRole('button', { name: 'V150' });
      await user.tab();
      await user.keyboard('{ArrowRight}');
      await screen.findByRole('button', { name: 'V210' });
      expect(source.requests.length).toBe(2);
      const [start, end] = source.requests[1];
      expect(start).toBeCloseTo(200);
      expect(end).toBeCloseTo(210);
    });

    it('should not load when the view is wider than maxLoadSpan', async () => {
      const source = new TestSource();
      await setupVirtual(source, { viewRange: undefined, maxLoadSpan: 300 });
      expect(source.requests).toEqual([]);
      expect(screen.getByRole('status').textContent).toContain(
        'Zoom in to load the points',
      );
    });

    it('should limit the margin to maxLoadSpan', async () => {
      const source = new TestSource();
      await setupVirtual(source, { loadMargin: 1, maxLoadSpan: 200 });
      expect(source.requests).toEqual([[50, 250]]);
    });

    it('should emit loadError when loading fails', async () => {
      const source = new TestSource();
      source.fail = true;
      const { fixture, loadError } = await setupVirtual(source);
      await fixture.whenStable();
      expect(loadError).toHaveBeenCalledTimes(1);
      expect(loadError.mock.calls[0][0].range.start.value).toBe(100);
      expect(screen.queryByRole('progressbar')).toBeNull();
    });

    it('should reload on demand', async () => {
      const source = new TestSource();
      const { fixture } = await setupVirtual(source);
      await screen.findByRole('button', { name: 'V150' });
      fixture.componentInstance.reload();
      expect(source.requests).toEqual([
        [100, 200],
        [100, 200],
      ]);
    });

    it('should ignore fixedStep', async () => {
      const source = new TestSource();
      const { viewRangeChange, user } = await setupVirtual(source, {
        fixedStep: true,
      });
      await screen.findByRole('button', { name: 'V150' });
      await user.tab();
      await user.keyboard('{ArrowRight}');
      // a linear scroll by 10% of the span
      const r = lastRange(viewRangeChange);
      expect(r.start.value).toBeCloseTo(110);
    });
  });
});
