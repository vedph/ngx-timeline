import { Component, computed, linkedSignal, signal, viewChild } from '@angular/core';
import { form, FormField, max, min } from '@angular/forms/signals';
import {
  TimelineComponent,
  TimelineDataError,
  TimelineLayout,
  TimelineOrientation,
  TimelinePoint,
  TimelinePointShape,
  TimelineRange,
  TimelineSelectionMode,
  TimelineSort,
} from '@myrmidon/timeline-view';

import {
  DemoDataset,
  getClustersDataset,
  getHistoryDataset,
  getRandomDataset,
  getVirtualDataset,
  VIRTUAL_COUNT,
  VIRTUAL_RANGE,
  YearTimelineParser,
} from './demo-data';
import { MockRequestInfo, MockTimelineDataSource } from './mock-timeline-data-source';

type DatasetName = 'history' | 'random' | 'clusters' | 'virtual';
type ColorMode = 'none' | 'auto' | 'palette';
type ShapeMode = 'data' | TimelinePointShape;
type Theme = 'system' | 'light' | 'dark';

interface DemoSettings {
  dataset: DatasetName;
  count: number;
  seed: number;
  orientation: TimelineOrientation;
  sort: TimelineSort;
  layout: TimelineLayout;
  selectionMode: TimelineSelectionMode;
  ruler: boolean;
  fixedStep: boolean;
  toolbar: boolean;
  presets: boolean;
  hilites: boolean;
  totalRange: boolean;
  colors: ColorMode;
  shapes: ShapeMode;
  maxZoom: number;
  maxLabelWidth: number;
  theme: Theme;
  latency: number;
  failures: boolean;
  maxLoadSpan: number;
}

const PALETTE = [
  '#1f77b4',
  '#ff7f0e',
  '#2ca02c',
  '#d62728',
  '#9467bd',
  'gold',
  'navy',
  'lightblue',
];

const MAX_LOG = 8;

@Component({
  selector: 'app-root',
  imports: [FormField, TimelineComponent],
  templateUrl: './app.html',
  styleUrl: './app.scss',
  host: {
    '[style.color-scheme]': "theme() === 'system' ? 'light dark' : theme()",
  },
})
export class App {
  private readonly _timeline = viewChild(TimelineComponent);
  private readonly _yearParser = new YearTimelineParser();

  protected readonly settings = signal<DemoSettings>({
    dataset: 'history',
    count: 200,
    seed: 42,
    orientation: 'horizontal',
    sort: 'ascending',
    layout: 'alternating',
    selectionMode: 'single',
    ruler: true,
    fixedStep: false,
    toolbar: true,
    presets: true,
    hilites: true,
    totalRange: true,
    colors: 'auto',
    shapes: 'data',
    maxZoom: 200,
    maxLabelWidth: 160,
    theme: 'system',
    latency: 600,
    failures: false,
    maxLoadSpan: 300,
  });

  protected readonly settingsForm = form(this.settings, (p) => {
    min(p.count, 0);
    max(p.count, 5000);
    min(p.maxZoom, 1);
    max(p.maxZoom, 100000);
    min(p.maxLabelWidth, 24);
    max(p.maxLabelWidth, 600);
    min(p.latency, 0);
    max(p.latency, 10000);
    min(p.maxLoadSpan, 0);
  });

  protected readonly theme = computed(() => this.settings().theme);

  // only the settings defining the data, so that changing other settings
  // does not rebuild the dataset (and reset the view)
  private readonly _datasetKey = computed(
    () => {
      const { dataset, count, seed } = this.settings();
      return { dataset, count, seed };
    },
    {
      equal: (a, b) => a.dataset === b.dataset && a.count === b.count && a.seed === b.seed,
    },
  );

  private readonly _dataset = computed<DemoDataset>(() => {
    const s = this._datasetKey();
    switch (s.dataset) {
      case 'random':
        return getRandomDataset(
          Math.min(5000, Math.max(0, Math.round(s.count || 0))),
          s.seed,
        );
      case 'clusters':
        return getClustersDataset();
      case 'virtual':
        return getVirtualDataset();
      default:
        return getHistoryDataset();
    }
  });

  protected readonly points = computed<TimelinePoint[]>(() => {
    const { colors, shapes } = this.settings();
    return this._dataset().points.map((p, i) => ({
      ...p,
      color:
        colors === 'auto'
          ? 'auto'
          : colors === 'palette'
            ? PALETTE[i % PALETTE.length]
            : undefined,
      shape: shapes === 'data' ? p.shape : shapes,
    }));
  });

  protected readonly presets = computed(() =>
    this.settings().presets ? this._dataset().presets : [],
  );

  protected readonly hilites = computed(() =>
    this.settings().hilites ? this._dataset().hilites : [],
  );

  // a data source requires an explicit total range
  protected readonly timelineRange = computed(() =>
    this.settings().totalRange || this._dataset().virtual
      ? this._dataset().timelineRange
      : undefined,
  );

  /**
   * The mock service simulating a remote database. It is created once, so
   * that changing the latency does not discard the loaded points.
   */
  private readonly _mockSource = new MockTimelineDataSource({
    count: VIRTUAL_COUNT,
    start: VIRTUAL_RANGE.start,
    end: VIRTUAL_RANGE.end,
    seed: 2026,
    latency: () => this.settings().latency || 0,
    failureRate: () => (this.settings().failures ? 0.3 : 0),
    format: (v) => this._yearParser.format(v),
    onRequest: (info) => this.onMockRequest(info),
  });

  protected readonly dataSource = computed(() =>
    this._dataset().virtual ? this._mockSource : undefined,
  );

  protected readonly virtualCount = this._mockSource.count;

  protected readonly loading = computed(() => this._timeline()?.loading() ?? false);

  protected readonly parser = computed(() =>
    this._dataset().years ? this._yearParser : undefined,
  );

  // view and selection are reset when the data change
  protected readonly viewRange = linkedSignal<DemoDataset, TimelineRange | undefined>({
    source: this._dataset,
    computation: (dataset) => dataset.initialView,
  });

  protected readonly selection = linkedSignal<TimelinePoint[], TimelinePoint[]>({
    source: this.points,
    computation: (_, previous) => {
      // keep the selection when only colors/shapes change
      const ids = new Set(this.points().map((p, i) => p.id ?? i + 1));
      return previous?.value.filter((p) => p.id !== undefined && ids.has(p.id)) ?? [];
    },
  });

  protected readonly log = signal<string[]>([]);

  protected readonly selectionText = computed(() => {
    const sel = this.selection();
    if (!sel.length) {
      return 'none';
    }
    const labels = sel.slice(0, 6).map((p) => p.label);
    return sel.length > 6 ? `${labels.join(', ')} … (+${sel.length - 6})` : labels.join(', ');
  });

  protected readonly viewText = computed(() => {
    const v = this.viewRange();
    return v ? `${v.start.label} – ${v.end.label}` : '(whole timeline)';
  });

  private addLog(text: string): void {
    this.log.update((items) => [text, ...items].slice(0, MAX_LOG));
  }

  protected onViewRangeChange(range: TimelineRange | undefined): void {
    this.viewRange.set(range);
    this.addLog(
      range ? `viewRangeChange: ${range.start.label} – ${range.end.label}` : 'viewRangeChange: (all)',
    );
  }

  private onMockRequest(info: MockRequestInfo): void {
    const range = `${info.range.start.label} – ${info.range.end.label}`;
    this.addLog(
      info.outcome === 'ok'
        ? `getPoints: ${range} → ${info.count} point(s) in ${info.ms} ms`
        : `getPoints: ${range} ${info.outcome}`,
    );
  }

  protected onLoadError(error: TimelineDataError): void {
    this.addLog(
      `loadError: ${error.range.start.label} – ${error.range.end.label} ` +
        `(${error.error instanceof Error ? error.error.message : error.error}); ` +
        'it will be retried at the next view change',
    );
  }

  protected reload(): void {
    this._timeline()?.reload();
  }

  protected onSelectionChange(points: TimelinePoint[]): void {
    this.selection.set(points);
    this.addLog(`selectionChange: ${points.length} point(s)`);
  }

  protected zoomIn(): void {
    this._timeline()?.zoomIn();
  }

  protected zoomOut(): void {
    this._timeline()?.zoomOut();
  }

  protected centerOnSelection(): void {
    const first = this.selection()[0];
    if (first) {
      this._timeline()?.centerOn(first.value);
    }
  }

  protected clearLog(): void {
    this.log.set([]);
  }
}
