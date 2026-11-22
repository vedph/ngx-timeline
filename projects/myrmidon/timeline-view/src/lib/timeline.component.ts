import {
  afterNextRender,
  afterRenderEffect,
  booleanAttribute,
  Component,
  computed,
  DestroyRef,
  DOCUMENT,
  effect,
  ElementRef,
  inject,
  Injector,
  input,
  model,
  numberAttribute,
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';

import {
  TimelineActivationSource,
  TimelineItemComponent,
  TimelineRenderItem,
} from './components/timeline-item.component';
import {
  TimelineRulerComponent,
  TimelineRulerTick,
} from './components/timeline-ruler.component';
import {
  TIMELINE_ZOOM_STEPS,
  TimelineToolbarComponent,
} from './components/timeline-toolbar.component';
import {
  DecoratedTimelineRange,
  TIMELINE_PARSER,
  TimelineDataError,
  TimelineDataSource,
  TimelineLayout,
  TimelineOrientation,
  TimelineParser,
  TimelinePoint,
  TimelinePointWithId,
  TimelineRange,
  TimelineSelectionMode,
  TimelineSort,
} from './models';
import { TimelineColorService } from './services/timeline-color.service';
import { TimelineTextMeasurer } from './services/timeline-text-measurer.service';
import {
  clampInterval,
  getZoomLevel,
  Interval,
  intervalAtZoom,
  intervalsEqual,
  panInterval,
  sliderToZoom,
  zoomInterval,
  zoomToSlider,
} from './utils/timeline-interval';
import {
  getTierCount,
  layoutTimelineItems,
  TimelineLayoutEntry,
  TimelineSide,
} from './utils/timeline-layout';
import {
  formatTimelineNumber,
  NumericTimelineParser,
} from './utils/numeric-timeline-parser';
import {
  isCustomTimelineRange,
  lowerBound,
  normalizeTimelinePoints,
  sortTimelinePoints,
  upperBound,
} from './utils/timeline-points';
import { TimelineDataLoader } from './utils/timeline-data-loader';
import { TimelineProjection } from './utils/timeline-projection';
import {
  addToTimelineSelection,
  toggleTimelineSelection,
} from './utils/timeline-selection';
import { computeTicks } from './utils/timeline-ticks';

/**
 * Metrics used for laying out the timeline, in pixels.
 */
export const TIMELINE_METRICS = {
  fontSize: 12,
  rulerFontSize: 10,
  boxHeight: 24,
  paddingX: 8,
  connector: 18,
  tierGap: 6,
  itemGap: 6,
  edgePad: 36,
  edgeMargin: 2,
  margin: 8,
  maxTiers: 8,
  rulerBandHorizontal: 34,
  rulerBandVertical: 64,
  rulerGap: 6,
  groupMinWidth: 28,
  defaultWidth: 800,
  defaultHeight: 300,
  scrollFraction: 0.25,
  keyScrollFraction: 0.1,
  zoomStep: 1.5,
  dragThreshold: 4,
} as const;

const M = TIMELINE_METRICS;

interface PlotGeometry {
  horizontal: boolean;
  width: number;
  height: number;
  /** The length along the axis. */
  length: number;
  /** The extent perpendicular to the axis. */
  thickness: number;
  axisPos: number;
  sides: TimelineSide[];
  sideSpace: number;
  plotStart: number;
  plotEnd: number;
  rulerBase: number;
  rulerDir: 1 | -1;
  /** True if hilite labels go at the start of the perpendicular extent. */
  hiliteLabelAtStart: boolean;
}

interface MeasuredLabel {
  text: string;
  boxWidth: number;
}

interface RenderedHilite {
  key: string;
  x: number;
  y: number;
  width: number;
  height: number;
  color?: string;
  title: string;
  text?: string;
  textX: number;
  textY: number;
  textAnchor: 'start' | 'end';
  textBaseline: 'hanging' | 'auto';
}

let nextTimelineId = 0;

/**
 * An interactive, SVG-based timeline view.
 */
@Component({
  selector: 'tm-timeline',
  imports: [
    TimelineItemComponent,
    TimelineRulerComponent,
    TimelineToolbarComponent,
  ],
  templateUrl: './timeline.component.html',
  styleUrl: './timeline.component.css',
  host: {
    class: 'tm-timeline',
    '[class.tm-vertical]': "orientation() === 'vertical'",
    '(focusin)': 'onFocusIn()',
    '(focusout)': 'onFocusOut($event)',
  },
})
export class TimelineComponent {
  private readonly _host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly _doc = inject(DOCUMENT);
  private readonly _injector = inject(Injector);
  private readonly _colorService = inject(TimelineColorService);
  private readonly _measurer = inject(TimelineTextMeasurer);
  private readonly _injectedParser = inject(TIMELINE_PARSER, {
    optional: true,
  });
  private readonly _defaultParser = new NumericTimelineParser();

  protected readonly id = `tm-timeline-${nextTimelineId++}`;

  //#region inputs

  /** The timeline orientation. */
  public readonly orientation = input<TimelineOrientation>('horizontal');
  /** The sort direction of values along the axis. */
  public readonly sort = input<TimelineSort>('ascending');
  /** Where points are placed relative to the axis. */
  public readonly layout = input<TimelineLayout>('alternating');
  /** True to display a ruler. */
  public readonly ruler = input(false, { transform: booleanAttribute });
  /** The selection mode. */
  public readonly selectionMode = input<TimelineSelectionMode>('single');
  /** The selected points (two-way bindable). */
  public readonly selection = model<TimelinePoint[]>([]);
  /**
   * The currently displayed range (two-way bindable). When undefined, the
   * whole timeline range is displayed.
   */
  public readonly viewRange = model<TimelineRange | undefined>(undefined);
  /**
   * The total range of the timeline. When undefined, it is computed from
   * the minimum and maximum points.
   */
  public readonly timelineRange = input<TimelineRange | undefined>(undefined);
  /** True to place points at a fixed distance, regardless of their value. */
  public readonly fixedStep = input(false, { transform: booleanAttribute });
  /** The points to display. */
  public readonly points = input<readonly TimelinePoint[]>([]);
  /** The preset view ranges users can pick from. */
  public readonly presetRanges = input<DecoratedTimelineRange[]>([]);
  /** The ranges to highlight with a background color. */
  public readonly hiliteRanges = input<DecoratedTimelineRange[]>([]);
  /** The parser for typed values. Defaults to numbers. */
  public readonly parser = input<TimelineParser | undefined>(undefined);
  /** The maximum zoom level. */
  public readonly maxZoom = input(200, { transform: numberAttribute });
  /** The maximum width of a point label, in pixels. */
  public readonly maxLabelWidth = input(160, { transform: numberAttribute });
  /** The accessible label of the timeline. */
  public readonly label = input('Timeline');
  /** True to show the toolbar. */
  public readonly toolbar = input(true, { transform: booleanAttribute });
  /**
   * The source of points loaded on demand. When set, the `points` input
   * is ignored, `fixedStep` is not applied, and `timelineRange` should be
   * set. See the documentation about virtual data.
   */
  public readonly dataSource = input<TimelineDataSource | undefined>(undefined);
  /**
   * The time in milliseconds the view must stay still before missing
   * points are loaded from the data source.
   */
  public readonly loadDebounce = input(300, { transform: numberAttribute });
  /**
   * The fraction of the view span loaded in advance before and after the
   * view, so that small scrolls do not require loading.
   */
  public readonly loadMargin = input(0.5, { transform: numberAttribute });
  /**
   * The maximum view span (in values) for which points are loaded from the
   * data source. When the view is wider, nothing is loaded and users are
   * invited to zoom in. Undefined or 0 = no limit.
   */
  public readonly maxLoadSpan = input<number | undefined>(undefined);

  //#endregion

  //#region outputs

  /** Emitted when loading points from the data source fails. */
  public readonly loadError = output<TimelineDataError>();

  //#endregion

  private readonly _plot = viewChild.required<ElementRef<HTMLElement>>('plot');
  private readonly _svg = viewChild.required<ElementRef<SVGSVGElement>>('svg');

  protected readonly size = signal(
    { width: 0, height: 0 },
    { equal: (a, b) => a.width === b.width && a.height === b.height },
  );
  private readonly _fontFamily = signal('sans-serif');
  protected readonly focusedKey = signal<string | null>(null);
  protected readonly dragging = signal(false);
  protected readonly customOpen = signal(false);

  private _lastView: {
    range: TimelineRange;
    projection: TimelineProjection;
    u: Interval;
  } | null = null;
  private readonly _pointers = new Map<number, number>();
  private _drag: { a: number; view: Interval } | null = null;
  private _pinch: { dist: number; view: Interval; anchor: number } | null =
    null;
  private _suppressClick = false;
  private _focusWithin = false;

  private readonly _loader = new TimelineDataLoader({
    toRange: (i) => this.toRange(i.start, i.end),
    onError: (e) => this.loadError.emit(e),
  });

  /** True while points are being loaded from the data source. */
  public readonly loading = this._loader.loading;

  //#region data

  /** The effective parser. */
  protected readonly effectiveParser = computed<TimelineParser>(
    () => this.parser() ?? this._injectedParser ?? this._defaultParser,
  );

  /** The points with their IDs. */
  protected readonly normalizedPoints = computed<
    readonly TimelinePointWithId[]
  >(() =>
    this.dataSource()
      ? this._loader.points()
      : normalizeTimelinePoints(this.points()),
  );

  /** The points sorted by value. */
  protected readonly sortedPoints = computed(() =>
    sortTimelinePoints(this.normalizedPoints()),
  );

  // fixed step would make positions shift as points are loaded
  protected readonly projection = computed(() =>
    this.fixedStep() && !this.dataSource()
      ? TimelineProjection.fixed(this.sortedPoints().map((p) => p.value))
      : TimelineProjection.linear(),
  );

  /** The U coordinate of each sorted point. */
  private readonly _pointUs = computed(() => {
    const fixed = this.projection().isFixed;
    return this.sortedPoints().map((p, i) => (fixed ? i : p.value));
  });

  private readonly _colors = computed(() =>
    this._colorService.resolve(this.normalizedPoints()),
  );

  /** The selection resolved against the normalized points. */
  private readonly _normalizedSelection = computed<TimelinePointWithId[]>(
    () => {
      const sel = this.selection();
      if (!sel?.length) {
        return [];
      }
      const normalized = this.normalizedPoints();
      const original = this.dataSource() ? normalized : this.points();
      const byId = new Map(normalized.map((p) => [p.id, p]));
      const result: TimelinePointWithId[] = [];
      for (const s of sel) {
        if (s.id !== undefined && s.id !== null) {
          const p = byId.get(s.id);
          if (p) {
            result.push(p);
          }
        } else {
          const i = original.indexOf(s);
          if (i > -1) {
            result.push(normalized[i]);
          }
        }
      }
      return result;
    },
  );

  private readonly _selectedIds = computed(
    () => new Set(this._normalizedSelection().map((p) => p.id)),
  );

  //#endregion

  //#region view

  /** The total range in U space. */
  protected readonly totalU = computed<Interval>(() => {
    const range = this.timelineRange();
    const proj = this.projection();
    const us = this._pointUs();
    let start: number;
    let end: number;
    if (range) {
      start = proj.toU(range.start.value, 'low');
      end = proj.toU(range.end.value, 'high');
      if (end < start) {
        [start, end] = [end, start];
      }
    } else if (us.length) {
      start = us[0];
      end = us[us.length - 1];
    } else {
      start = 0;
      end = 1;
    }
    if (!(end - start > 0)) {
      const pad = proj.isFixed ? 0.5 : 1;
      start -= pad;
      end += pad;
    }
    return { start, end };
  });

  private readonly _minSpan = computed(() => {
    const t = this.totalU();
    const span = t.end - t.start;
    const zoom = Math.max(1, this.maxZoom() || 1);
    return this.projection().isFixed
      ? Math.min(span, Math.max(1, span / zoom))
      : span / zoom;
  });

  /** The displayed range in U space. */
  protected readonly viewU = computed<Interval>(() => {
    const vr = this.viewRange();
    const total = this.totalU();
    const proj = this.projection();
    let raw: Interval;
    const last = this._lastView;
    if (!vr) {
      raw = total;
    } else if (last && last.range === vr && last.projection === proj) {
      raw = last.u;
    } else {
      raw = {
        start: proj.toU(vr.start.value, 'low'),
        end: proj.toU(vr.end.value, 'high'),
      };
    }
    return clampInterval(raw, total, this._minSpan());
  });

  protected readonly zoomLevel = computed(() =>
    getZoomLevel(this.viewU(), this.totalU()),
  );

  private readonly _effectiveMaxZoom = computed(() => {
    const t = this.totalU();
    return (t.end - t.start) / (this._minSpan() || 1);
  });

  protected readonly zoomSlider = computed(() =>
    zoomToSlider(this.zoomLevel(), this._effectiveMaxZoom(), TIMELINE_ZOOM_STEPS),
  );

  protected readonly zoomText = computed(() => {
    const z = this.zoomLevel();
    return (z < 10 ? z.toFixed(1) : Math.round(z).toString()) + '×';
  });

  /** The labels of the current view bounds. */
  protected readonly viewLabels = computed(() => {
    const v = this.viewU();
    const proj = this.projection();
    const v0 = proj.toValue(v.start);
    const v1 = proj.toValue(v.end);
    const step = Math.abs(v1 - v0) / 200 || undefined;
    return { start: this.formatValue(v0, step), end: this.formatValue(v1, step) };
  });

  protected readonly viewText = computed(() => {
    const l = this.viewLabels();
    return `${l.start} – ${l.end}`;
  });

  /** The index of the preset matching the current view, or -1. */
  protected readonly presetIndex = computed(() => {
    const presets = this.presetRanges();
    if (this.customOpen()) {
      return presets.findIndex((p) => isCustomTimelineRange(p));
    }
    const v = this.viewU();
    const total = this.totalU();
    const proj = this.projection();
    const span = total.end - total.start;
    return presets.findIndex(
      (p) =>
        !isCustomTimelineRange(p) &&
        intervalsEqual(
          clampInterval(
            {
              start: proj.toU(p.start.value, 'low'),
              end: proj.toU(p.end.value, 'high'),
            },
            total,
            this._minSpan(),
          ),
          v,
          span,
        ),
    );
  });

  /** True if the view is too wide to load points from the data source. */
  protected readonly tooWideToLoad = computed(() => {
    const max = this.maxLoadSpan();
    const v = this.viewU();
    return !!this.dataSource() && !!max && max > 0 && v.end - v.start > max;
  });

  /**
   * The value interval to be loaded from the data source: the view plus
   * a margin, inside the total range. Null when nothing must be loaded.
   * Since fixed step is not applied with a data source, U = value.
   */
  private readonly _loadTarget = computed<Interval | null>(
    () => {
      if (!this.dataSource() || this.tooWideToLoad()) {
        return null;
      }
      const v = this.viewU();
      const total = this.totalU();
      const span = v.end - v.start;
      let margin = Math.max(0, this.loadMargin() || 0) * span;
      const max = this.maxLoadSpan();
      if (max && max > 0) {
        margin = Math.min(margin, Math.max(0, (max - span) / 2));
      }
      return {
        start: Math.max(total.start, v.start - margin),
        end: Math.min(total.end, v.end + margin),
      };
    },
    {
      equal: (a, b) =>
        a === b || (!!a && !!b && a.start === b.start && a.end === b.end),
    },
  );

  protected readonly loadStatus = computed(() =>
    this.tooWideToLoad() ? 'Zoom in to load the points' : '',
  );

  protected readonly selectionStatus = computed(() => {
    const n = this._normalizedSelection().length;
    return n === 0
      ? 'No points selected'
      : n === 1
        ? '1 point selected'
        : `${n} points selected`;
  });

  //#endregion

  //#region geometry

  protected readonly geometry = computed<PlotGeometry>(() => {
    const { width, height } = this.size();
    const w = width > 0 ? width : M.defaultWidth;
    const h = height > 0 ? height : M.defaultHeight;
    const horizontal = this.orientation() !== 'vertical';
    const length = horizontal ? w : h;
    const thickness = horizontal ? h : w;
    const ruler = this.ruler();
    const band = ruler
      ? horizontal
        ? M.rulerBandHorizontal
        : M.rulerBandVertical
      : 0;
    let axisPos: number;
    let sides: TimelineSide[];
    let sideSpace: number;
    let rulerBase: number;
    let rulerDir: 1 | -1;
    let hiliteLabelAtStart: boolean;

    switch (this.layout()) {
      case 'leftOrAbove':
        axisPos = thickness - M.margin - band;
        sides = ['before'];
        sideSpace = axisPos - M.margin;
        rulerBase = axisPos + M.rulerGap;
        rulerDir = 1;
        hiliteLabelAtStart = true;
        break;
      case 'rightOrBelow':
        axisPos = M.margin + band;
        sides = ['after'];
        sideSpace = thickness - axisPos - M.margin;
        rulerBase = axisPos - M.rulerGap;
        rulerDir = -1;
        hiliteLabelAtStart = false;
        break;
      default:
        axisPos = band + (thickness - band) / 2;
        sides = ['before', 'after'];
        sideSpace = (thickness - band) / 2 - M.margin;
        rulerBase = 4;
        rulerDir = 1;
        hiliteLabelAtStart = !ruler;
        break;
    }
    return {
      horizontal,
      width: w,
      height: h,
      length,
      thickness,
      axisPos,
      sides,
      sideSpace: Math.max(0, sideSpace),
      plotStart: M.edgePad,
      plotEnd: Math.max(M.edgePad + 1, length - M.edgePad),
      rulerBase,
      rulerDir,
      hiliteLabelAtStart,
    };
  });

  /** The number of U units per pixel. */
  private readonly _uPerPx = computed(() => {
    const v = this.viewU();
    const g = this.geometry();
    return (v.end - v.start) / (g.plotEnd - g.plotStart);
  });

  /** A function mapping U to a pixel position along the axis. */
  private readonly _toPx = computed(() => {
    const v = this.viewU();
    const g = this.geometry();
    const k = 1 / this._uPerPx();
    return this.sort() === 'descending'
      ? (u: number) => g.plotEnd - (u - v.start) * k
      : (u: number) => g.plotStart + (u - v.start) * k;
  });

  private readonly _labelBudget = computed(() => {
    const g = this.geometry();
    const max = Math.max(8, this.maxLabelWidth());
    if (g.horizontal) {
      return max;
    }
    return Math.max(
      24,
      Math.min(max, g.sideSpace - M.connector - 2 * M.paddingX - 4),
    );
  });

  /**
   * A cache of measured labels, reset when the measurement parameters
   * change. This avoids measuring all the points again when only some of
   * them change, e.g. when new points are loaded from a data source.
   */
  private readonly _measureCache = computed(() => {
    this._labelBudget();
    this._fontFamily();
    return new WeakMap<TimelinePointWithId, MeasuredLabel>();
  });

  private readonly _measured = computed<MeasuredLabel[]>(() => {
    const budget = this._labelBudget();
    const font = this._fontFamily();
    const cache = this._measureCache();
    return this.sortedPoints().map((p) => {
      let m = cache.get(p);
      if (!m) {
        const t = this._measurer.truncate(p.label, budget, M.fontSize, font);
        const extra = p.shape === 'oval' ? M.boxHeight * 0.5 : 0;
        m = {
          text: t.text,
          boxWidth: Math.ceil(t.width + 2 * M.paddingX + extra),
        };
        cache.set(p, m);
      }
      return m;
    });
  });

  private readonly _tierThickness = computed(() => {
    if (this.geometry().horizontal) {
      return M.boxHeight;
    }
    let max: number = M.groupMinWidth;
    for (const m of this._measured()) {
      max = Math.max(max, m.boxWidth);
    }
    return max;
  });

  private readonly _visibleEntries = computed<TimelineLayoutEntry<number>[]>(
    () => {
      const v = this.viewU();
      const us = this._pointUs();
      const margin = (M.edgePad - 4) * this._uPerPx();
      const i0 = lowerBound(us, v.start - margin);
      const i1 = upperBound(us, v.end + margin);
      const px = this._toPx();
      const measured = this._measured();
      const sorted = this.sortedPoints();
      const horizontal = this.geometry().horizontal;
      const entries: TimelineLayoutEntry<number>[] = [];
      for (let i = i0; i < i1; i++) {
        const w = measured[i].boxWidth;
        entries.push({
          key: `p:${i}:${sorted[i].id}`,
          a: px(us[i]),
          ext: horizontal ? w : M.boxHeight,
          thick: horizontal ? M.boxHeight : w,
          data: i,
        });
      }
      if (this.sort() === 'descending') {
        entries.reverse();
      }
      return entries;
    },
  );

  private readonly _layout = computed(() => {
    const g = this.geometry();
    const tierThickness = this._tierThickness();
    const font = this._fontFamily();
    return layoutTimelineItems(this._visibleEntries(), {
      orientation: g.horizontal ? 'horizontal' : 'vertical',
      sides: g.sides,
      length: g.length,
      axisPos: g.axisPos,
      tiers: getTierCount(
        g.sideSpace,
        M.connector,
        tierThickness,
        M.tierGap,
        M.maxTiers,
      ),
      connector: M.connector,
      tierThickness,
      tierGap: M.tierGap,
      itemGap: M.itemGap,
      edgeMargin: M.edgeMargin,
      groupSize: (count) => {
        const w = Math.max(
          M.groupMinWidth,
          Math.ceil(
            this._measurer.measure(String(count), M.fontSize, font) +
              2 * M.paddingX,
          ),
        );
        return g.horizontal
          ? { ext: w, thick: M.boxHeight }
          : { ext: M.boxHeight, thick: w };
      },
    });
  });

  /** The items to render. */
  protected readonly renderItems = computed<TimelineRenderItem[]>(() => {
    const sorted = this.sortedPoints();
    const us = this._pointUs();
    const measured = this._measured();
    const colors = this._colors();
    const selected = this._selectedIds();

    return this._layout().map((l) => {
      const indexes = l.members.map((m) => m.data).sort((a, b) => a - b);
      const points = indexes.map((i) => sorted[i]);
      const base = {
        key: l.key,
        x: l.box.x,
        y: l.box.y,
        width: l.box.width,
        height: l.box.height,
        cx: l.box.x + l.box.width / 2,
        cy: l.box.y + l.box.height / 2,
        connector: l.connector,
        bracket: l.bracket,
        points,
        memberKeys: l.members.map((m) => m.key),
        uStart: us[indexes[0]],
        uEnd: us[indexes[indexes.length - 1]],
      };
      if (l.kind === 'point') {
        const p = points[0];
        const c = colors.get(p.id);
        return {
          ...base,
          kind: 'point',
          shape: p.shape ?? 'rectangle',
          text: measured[indexes[0]].text,
          fill: c?.fill,
          textColor: c?.text,
          title: p.tip ? `${p.label}\n${p.tip}` : p.label,
          ariaLabel: p.tip ? `${p.label}: ${p.tip}` : p.label,
          selected: selected.has(p.id),
        } satisfies TimelineRenderItem;
      }
      const n = points.length;
      const shown = points.slice(0, 10).map((p) => p.label);
      if (n > 10) {
        shown.push(`…and ${n - 10} more`);
      }
      return {
        ...base,
        kind: 'group',
        shape: 'rectangle',
        text: String(n),
        title: `${n} points\n${shown.join('\n')}`,
        ariaLabel: `Group of ${n} points, from ${points[0].label} to ${points[n - 1].label}`,
        selected: points.some((p) => selected.has(p.id)),
      } satisfies TimelineRenderItem;
    });
  });

  /** The key of the item which is the tab stop. */
  protected readonly activeKey = computed(() => {
    const items = this.renderItems();
    const key = this.focusedKey();
    return key && items.some((i) => i.key === key)
      ? key
      : (items[0]?.key ?? null);
  });

  protected readonly ticks = computed<TimelineRulerTick[]>(() => {
    if (!this.ruler()) {
      return [];
    }
    const g = this.geometry();
    const v = this.viewU();
    const proj = this.projection();
    const px = this._toPx();
    const font = this._fontFamily();
    const v0 = proj.toValue(v.start);
    const v1 = proj.toValue(v.end);
    const sampleStep = Math.abs(v1 - v0) / 10 || undefined;
    const sampleWidth = Math.max(
      this._measurer.measure(this.formatValue(v0, sampleStep), M.rulerFontSize, font),
      this._measurer.measure(this.formatValue(v1, sampleStep), M.rulerFontSize, font),
    );
    const spacing = g.horizontal ? Math.max(80, sampleWidth + 24) : 44;
    const majorCount = Math.max(1, (g.plotEnd - g.plotStart) / spacing);
    const fixed = proj.isFixed;
    const { ticks, step } = computeTicks(v.start, v.end, majorCount, fixed);
    const valueStep = fixed ? undefined : step;
    return ticks.map((t) => ({
      key: String(t.value),
      pos: px(t.value),
      major: t.major,
      label: t.major
        ? this.formatValue(fixed ? proj.toValue(t.value) : t.value, valueStep)
        : undefined,
    }));
  });

  protected readonly hilites = computed<RenderedHilite[]>(() => {
    const ranges = this.hiliteRanges();
    if (!ranges.length) {
      return [];
    }
    const g = this.geometry();
    const proj = this.projection();
    const px = this._toPx();
    const font = this._fontFamily();
    const result: RenderedHilite[] = [];
    ranges.forEach((r, i) => {
      const a = px(proj.toU(r.start.value, 'low'));
      const b = px(proj.toU(r.end.value, 'high'));
      let lo = Math.max(0, Math.min(a, b));
      let hi = Math.min(g.length, Math.max(a, b));
      if (hi < 0 || lo > g.length || hi < lo) {
        return;
      }
      if (hi - lo < 2) {
        const c = (lo + hi) / 2;
        lo = c - 1;
        hi = c + 1;
      }
      const extent = hi - lo;
      const labelRoom = g.horizontal ? extent - 8 : g.thickness / 3;
      const text =
        r.label && labelRoom >= 16 && (g.horizontal || extent >= 16)
          ? this._measurer.truncate(r.label, labelRoom, M.rulerFontSize, font)
              .text
          : undefined;
      const atStart = g.hiliteLabelAtStart;
      result.push({
        key: `h${i}`,
        x: g.horizontal ? lo : 0,
        y: g.horizontal ? 0 : lo,
        width: g.horizontal ? extent : g.thickness,
        height: g.horizontal ? g.thickness : extent,
        color: r.color,
        title: `${r.label}: ${r.start.label} – ${r.end.label}`,
        text,
        textX: g.horizontal ? lo + 4 : atStart ? 4 : g.thickness - 4,
        textY: g.horizontal ? (atStart ? 4 : g.thickness - 4) : lo + 4,
        textAnchor: g.horizontal || atStart ? 'start' : 'end',
        textBaseline: g.horizontal && !atStart ? 'auto' : 'hanging',
      });
    });
    return result;
  });

  /** True if the view can be scrolled toward the start of the axis. */
  protected readonly canScrollLow = computed(() =>
    this.sort() === 'descending' ? this._canScrollUp() : this._canScrollDown(),
  );

  /** True if the view can be scrolled toward the end of the axis. */
  protected readonly canScrollHigh = computed(() =>
    this.sort() === 'descending' ? this._canScrollDown() : this._canScrollUp(),
  );

  private readonly _canScrollDown = computed(() => {
    const t = this.totalU();
    return this.viewU().start > t.start + (t.end - t.start) * 1e-9;
  });

  private readonly _canScrollUp = computed(() => {
    const t = this.totalU();
    return this.viewU().end < t.end - (t.end - t.start) * 1e-9;
  });

  /** The geometry of the axis and scroll buttons. */
  protected readonly axis = computed(() => {
    const g = this.geometry();
    const p = g.axisPos;
    const lowA = 14;
    const highA = g.length - 14;
    const tri = (a: number, dir: -1 | 1): string => {
      const tip = a + dir * 6;
      const back = a - dir * 5;
      return g.horizontal
        ? `M${tip},${p} L${back},${p - 7} L${back},${p + 7} Z`
        : `M${p},${tip} L${p - 7},${back} L${p + 7},${back} Z`;
    };
    const point = (a: number) =>
      g.horizontal ? { x: a, y: p } : { x: p, y: a };
    const from = point(28);
    const to = point(Math.max(28, g.length - 28));
    return {
      x1: from.x,
      y1: from.y,
      x2: to.x,
      y2: to.y,
      low: { ...point(lowA), path: tri(lowA, -1) },
      high: { ...point(highA), path: tri(highA, 1) },
      lowLabel: g.horizontal ? 'Scroll left' : 'Scroll up',
      highLabel: g.horizontal ? 'Scroll right' : 'Scroll down',
    };
  });

  //#endregion

  constructor() {
    const destroyRef = inject(DestroyRef);
    destroyRef.onDestroy(() => this._loader.destroy());

    // load the missing points when the view changes
    effect(() => {
      const source = this.dataSource();
      const target = this._loadTarget();
      const debounce = this.loadDebounce();
      untracked(() => this._loader.update(source, target, debounce));
    });

    if (typeof ngDevMode === 'undefined' || ngDevMode) {
      effect(() => {
        if (this.dataSource() && !this.timelineRange()) {
          console.warn(
            'tm-timeline: set timelineRange when using a dataSource, ' +
              'otherwise the total range depends on the loaded points.',
          );
        }
      });
    }
    afterNextRender(() => {
      const el = this._plot().nativeElement;
      const rect = el.getBoundingClientRect();
      this.size.set({ width: rect.width, height: rect.height });
      const family = getComputedStyle(this._svg().nativeElement).fontFamily;
      if (family) {
        this._fontFamily.set(family);
      }
      if (typeof ResizeObserver !== 'undefined') {
        const ro = new ResizeObserver((entries) => {
          const r = entries[entries.length - 1].contentRect;
          this.size.set({ width: r.width, height: r.height });
        });
        ro.observe(el);
        destroyRef.onDestroy(() => ro.disconnect());
      }
    });

    // keep focus inside the timeline when the focused item disappears
    // because of zooming or scrolling
    afterRenderEffect(() => {
      const key = this.activeKey();
      if (!this._focusWithin) {
        return;
      }
      const active = this._doc.activeElement;
      if (
        active &&
        active !== this._doc.body &&
        this._host.nativeElement.contains(active)
      ) {
        return;
      }
      this.focusElement(key);
    });
  }

  //#region helpers

  private formatValue(value: number, step?: number): string {
    const p = this.effectiveParser();
    return p.format ? p.format(value, step) : formatTimelineNumber(value, step);
  }

  /** Build a range from two values, formatting their labels. */
  private toRange(v0: number, v1: number): TimelineRange {
    const step = Math.abs(v1 - v0) / 1000 || undefined;
    return {
      start: { label: this.formatValue(v0, step), value: v0 },
      end: { label: this.formatValue(v1, step), value: v1 },
    };
  }

  private alongAxis(event: MouseEvent): number {
    const rect = this._svg().nativeElement.getBoundingClientRect();
    return this.geometry().horizontal
      ? event.clientX - rect.left
      : event.clientY - rect.top;
  }

  private uAtPx(a: number): number {
    const v = this.viewU();
    const g = this.geometry();
    const k = this._uPerPx();
    return this.sort() === 'descending'
      ? v.start + (g.plotEnd - a) * k
      : v.start + (a - g.plotStart) * k;
  }

  private setViewU(next: Interval): void {
    const total = this.totalU();
    const clamped = clampInterval(next, total, this._minSpan());
    if (intervalsEqual(clamped, this.viewU(), total.end - total.start, 1e-12)) {
      return;
    }
    const proj = this.projection();
    const range = this.toRange(
      proj.toValue(clamped.start),
      proj.toValue(clamped.end),
    );
    this._lastView = { range, projection: proj, u: clamped };
    this.viewRange.set(range);
  }

  private focusElement(key: string | null): void {
    const svg = this._svg().nativeElement;
    const el = key
      ? svg.querySelector<SVGElement>(`[data-key="${key}"]`)
      : null;
    (el ?? svg).focus();
  }

  private focusKey(key: string): void {
    this.focusedKey.set(key);
    this.focusElement(key);
  }

  //#endregion

  //#region public API

  /**
   * Zoom by the specified factor.
   *
   * @param factor The zoom factor: >1 zooms in, <1 zooms out.
   * @param anchorValue The value which stays fixed while zooming. Default
   * is the center of the view.
   */
  public zoomBy(factor: number, anchorValue?: number): void {
    const anchor =
      anchorValue === undefined
        ? (this.viewU().start + this.viewU().end) / 2
        : this.projection().toU(anchorValue);
    this.zoomAtU(factor, anchor);
  }

  /** Zoom in by a single step. */
  public zoomIn(): void {
    this.zoomBy(M.zoomStep);
  }

  /** Zoom out by a single step. */
  public zoomOut(): void {
    this.zoomBy(1 / M.zoomStep);
  }

  /** Reset the zoom, displaying the whole timeline. */
  public resetZoom(): void {
    this.setViewU(this.totalU());
  }

  /**
   * Scroll the view by the specified fraction of its span. Positive values
   * scroll toward higher values.
   */
  public scrollBy(fraction: number): void {
    const v = this.viewU();
    this.setViewU(
      panInterval(v, fraction * (v.end - v.start), this.totalU()),
    );
  }

  /** Center the view on the specified value, without changing the zoom. */
  public centerOn(value: number): void {
    const v = this.viewU();
    const half = (v.end - v.start) / 2;
    const u = this.projection().toU(value);
    this.setViewU({ start: u - half, end: u + half });
  }

  /**
   * Discard all the points loaded from the data source, and load again
   * those required by the current view. Use it when the data behind the
   * source changed.
   */
  public reload(): void {
    this._loader.reload();
  }

  /** Clear the selection. */
  public clearSelection(): void {
    if (this.selection().length) {
      this.selection.set([]);
    }
  }

  //#endregion

  //#region event handlers

  private zoomAtU(factor: number, anchor: number): void {
    this.setViewU(
      zoomInterval(this.viewU(), factor, anchor, this.totalU(), this._minSpan()),
    );
  }

  /**
   * Scroll by a page fraction in screen direction: -1 = toward the start
   * of the axis (left/top), 1 = toward its end.
   */
  protected scrollScreen(dir: -1 | 1, fraction: number = M.scrollFraction): void {
    const sign = this.sort() === 'descending' ? -1 : 1;
    this.scrollBy(dir * sign * fraction);
  }

  private panScreenPx(delta: number): boolean {
    const sign = this.sort() === 'descending' ? -1 : 1;
    const before = this.viewU();
    this.setViewU(
      panInterval(before, delta * this._uPerPx() * sign, this.totalU()),
    );
    return this.viewU() !== before;
  }

  protected onZoomSlider(value: number): void {
    const zoom = sliderToZoom(value, this._effectiveMaxZoom(), TIMELINE_ZOOM_STEPS);
    this.setViewU(
      intervalAtZoom(this.viewU(), zoom, this.totalU(), this._minSpan()),
    );
  }

  protected onPresetSelect(index: number): void {
    const preset = this.presetRanges()[index];
    if (!preset) {
      return;
    }
    if (isCustomTimelineRange(preset)) {
      this.customOpen.set(true);
      return;
    }
    this.customOpen.set(false);
    this.viewRange.set({ start: preset.start, end: preset.end });
  }

  protected onCustomApply(range: TimelineRange): void {
    this.viewRange.set(range);
  }

  protected onItemActivate(
    item: TimelineRenderItem,
    source: TimelineActivationSource,
  ): void {
    if (source === 'pointer' && this._suppressClick) {
      this._suppressClick = false;
      return;
    }
    this.focusedKey.set(item.key);
    const mode = this.selectionMode();
    const sorted = this.sortedPoints();
    const current = this._normalizedSelection();

    if (item.kind === 'point') {
      this.selection.set(
        toggleTimelineSelection(mode, sorted, current, item.points[0]),
      );
      return;
    }

    // group: zoom into it if possible, else select its members
    const span = item.uEnd - item.uStart;
    const minSpan = this._minSpan();
    const pad = Math.max(span * 0.25, minSpan / 2);
    const target = clampInterval(
      { start: item.uStart - pad, end: item.uEnd + pad },
      this.totalU(),
      minSpan,
    );
    const v = this.viewU();
    if (target.end - target.start < (v.end - v.start) * 0.95) {
      this.focusedKey.set(item.memberKeys[0] ?? null);
      this.setViewU(target);
    } else {
      this.selection.set(
        addToTimelineSelection(mode, sorted, current, item.points),
      );
    }
  }

  protected onItemFocus(item: TimelineRenderItem): void {
    this.focusedKey.set(item.key);
  }

  protected onFocusIn(): void {
    this._focusWithin = true;
  }

  protected onFocusOut(event: FocusEvent): void {
    const next = event.relatedTarget as Node | null;
    if (!next || !this._host.nativeElement.contains(next)) {
      this._focusWithin = false;
    }
  }

  protected onKeydown(event: KeyboardEvent): void {
    if (event.altKey) {
      return;
    }
    const isArrow = event.key.startsWith('Arrow');
    if ((event.ctrlKey || event.metaKey) && !isArrow) {
      return;
    }
    const items = this.renderItems();
    const dir: -1 | 1 =
      event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : -1;
    if (isArrow) {
      // arrows scroll; ctrl/cmd+arrows move between items
      if (event.ctrlKey || event.metaKey) {
        this.moveFocus(dir);
      } else {
        this.scrollScreen(dir, M.keyScrollFraction);
      }
      event.preventDefault();
      return;
    }
    switch (event.key) {
      case 'Home':
        if (items.length) {
          this.focusKey(items[0].key);
        }
        break;
      case 'End':
        if (items.length) {
          this.focusKey(items[items.length - 1].key);
        }
        break;
      case '+':
      case '=':
        this.zoomAtFocus(M.zoomStep);
        break;
      case '-':
      case '_':
        this.zoomAtFocus(1 / M.zoomStep);
        break;
      case '0':
        this.resetZoom();
        break;
      case 'PageUp':
        this.scrollScreen(-1);
        break;
      case 'PageDown':
        this.scrollScreen(1);
        break;
      default:
        return;
    }
    event.preventDefault();
  }

  private zoomAtFocus(factor: number): void {
    const item = this.renderItems().find((i) => i.key === this.activeKey());
    const v = this.viewU();
    const anchor = item
      ? (item.uStart + item.uEnd) / 2
      : (v.start + v.end) / 2;
    this.zoomAtU(factor, anchor);
  }

  private moveFocus(dir: -1 | 1): void {
    const items = this.renderItems();
    const key = this.activeKey();
    const index = items.findIndex((i) => i.key === key);
    const target = index + dir;
    if (index > -1 && target >= 0 && target < items.length) {
      this.focusKey(items[target].key);
      return;
    }
    // at the edge: scroll, then move to the next item if any
    const before = this.viewU();
    this.scrollScreen(dir);
    if (this.viewU() === before) {
      return;
    }
    afterNextRender(
      () => {
        const next = this.renderItems();
        if (!next.length) {
          this.focusElement(null);
          return;
        }
        const i = next.findIndex((it) => it.key === key);
        const t =
          i > -1
            ? Math.min(next.length - 1, Math.max(0, i + dir))
            : dir > 0
              ? 0
              : next.length - 1;
        this.focusKey(next[t].key);
      },
      { injector: this._injector },
    );
  }

  protected onWheel(event: WheelEvent): void {
    const g = this.geometry();
    const scale =
      event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? g.length : 1;
    const dx = event.deltaX;
    const dy = event.deltaY;
    // horizontal swipes (trackpads) and shift+wheel scroll; browsers may
    // report shift+wheel as deltaX
    if (event.shiftKey || Math.abs(dx) > Math.abs(dy)) {
      const delta = (Math.abs(dx) > Math.abs(dy) ? dx : dy) * scale;
      if (delta && this.panScreenPx(delta)) {
        event.preventDefault();
      }
      return;
    }
    // the wheel zooms around the pointer (trackpad pinch is reported as
    // ctrl+wheel, so it zooms too)
    if (!dy) {
      return;
    }
    const before = this.viewU();
    this.zoomAtU(
      Math.exp(-dy * scale * 0.002),
      this.uAtPx(this.alongAxis(event)),
    );
    // leave the event to the page when the zoom limits are reached, unless
    // this is a pinch, which would zoom the page
    if (this.viewU() !== before || event.ctrlKey || event.metaKey) {
      event.preventDefault();
    }
  }

  protected onPointerDown(event: PointerEvent): void {
    if (event.pointerType === 'mouse' && event.button !== 0) {
      return;
    }
    if (!this._pointers.size) {
      this._suppressClick = false;
    }
    const a = this.alongAxis(event);
    this._pointers.set(event.pointerId, a);
    if (this._pointers.size === 1) {
      this._drag = { a, view: this.viewU() };
      this._pinch = null;
    } else if (this._pointers.size === 2) {
      const [p, q] = [...this._pointers.values()];
      this._pinch = {
        dist: Math.max(1, Math.abs(p - q)),
        view: this.viewU(),
        anchor: this.uAtPx((p + q) / 2),
      };
      this._drag = null;
    }
  }

  protected onPointerMove(event: PointerEvent): void {
    if (!this._pointers.has(event.pointerId)) {
      return;
    }
    const a = this.alongAxis(event);
    this._pointers.set(event.pointerId, a);

    if (this._pinch && this._pointers.size === 2) {
      const [p, q] = [...this._pointers.values()];
      this._suppressClick = true;
      this.setViewU(
        zoomInterval(
          this._pinch.view,
          Math.max(1, Math.abs(p - q)) / this._pinch.dist,
          this._pinch.anchor,
          this.totalU(),
          this._minSpan(),
        ),
      );
      return;
    }
    if (!this._drag) {
      return;
    }
    const delta = a - this._drag.a;
    if (!this._suppressClick) {
      if (Math.abs(delta) < M.dragThreshold) {
        return;
      }
      // capture only once dragging, so that clicks still target items
      this._suppressClick = true;
      this.dragging.set(true);
      const svg = this._svg().nativeElement;
      if (typeof svg.setPointerCapture === 'function') {
        try {
          svg.setPointerCapture(event.pointerId);
        } catch {
          // ignore
        }
      }
    }
    const g = this.geometry();
    const view = this._drag.view;
    const uPerPx = (view.end - view.start) / (g.plotEnd - g.plotStart);
    const sign = this.sort() === 'descending' ? -1 : 1;
    this.setViewU(panInterval(view, -delta * uPerPx * sign, this.totalU()));
  }

  protected onPointerUp(event: PointerEvent): void {
    this._pointers.delete(event.pointerId);
    if (!this._pointers.size) {
      this._drag = null;
      this._pinch = null;
      this.dragging.set(false);
    } else if (this._pointers.size === 1) {
      const [a] = [...this._pointers.values()];
      this._drag = { a, view: this.viewU() };
      this._pinch = null;
    }
  }

  //#endregion
}
