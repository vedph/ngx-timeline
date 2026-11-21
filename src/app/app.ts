import { Component, computed, linkedSignal, signal, viewChild } from '@angular/core';
import { form, FormField, max, min } from '@angular/forms/signals';
import {
  TimelineComponent,
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
  YearTimelineParser,
} from './demo-data';

type DatasetName = 'history' | 'random' | 'clusters';
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
  });

  protected readonly settingsForm = form(this.settings, (p) => {
    min(p.count, 0);
    max(p.count, 5000);
    min(p.maxZoom, 1);
    max(p.maxZoom, 100000);
    min(p.maxLabelWidth, 24);
    max(p.maxLabelWidth, 600);
  });

  protected readonly theme = computed(() => this.settings().theme);

  private readonly _dataset = computed<DemoDataset>(() => {
    const s = this.settings();
    switch (s.dataset) {
      case 'random':
        return getRandomDataset(
          Math.min(5000, Math.max(0, Math.round(s.count || 0))),
          s.seed,
        );
      case 'clusters':
        return getClustersDataset();
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

  protected readonly timelineRange = computed(() =>
    this.settings().totalRange ? this._dataset().timelineRange : undefined,
  );

  protected readonly parser = computed(() =>
    this._dataset().years ? this._yearParser : undefined,
  );

  // view and selection are reset when the data change
  protected readonly viewRange = linkedSignal<DemoDataset, TimelineRange | undefined>({
    source: this._dataset,
    computation: () => undefined,
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
