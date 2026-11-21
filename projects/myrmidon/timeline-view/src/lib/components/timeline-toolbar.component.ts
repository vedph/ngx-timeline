import { Component, input, output } from '@angular/core';

import { DecoratedTimelineRange, TimelineParser, TimelineRange } from '../models';
import { TIMELINE_CONTROL_STYLES } from './timeline-control-styles';
import { TimelineCustomRangeComponent } from './timeline-custom-range.component';

let nextId = 0;

/**
 * The number of steps of the zoom slider.
 */
export const TIMELINE_ZOOM_STEPS = 1000;

/**
 * The timeline toolbar: selection, zoom and preset range controls.
 * This is a presentational component: all the state lives in the timeline.
 */
@Component({
  selector: 'tm-timeline-toolbar',
  imports: [TimelineCustomRangeComponent],
  template: `
    <div class="tm-toolbar" role="group" aria-label="Timeline controls">
      <button
        type="button"
        class="tm-btn"
        [attr.aria-disabled]="selectionCount() ? null : 'true'"
        (click)="selectionCount() && clearSelection.emit()"
      >
        Clear selection
        @if (selectionCount()) {
          <span class="tm-badge">{{ selectionCount() }}</span>
        }
      </button>

      <div class="tm-zoom">
        <label [for]="id + '-zoom'">Zoom</label>
        <input
          [id]="id + '-zoom'"
          type="range"
          min="0"
          [max]="steps"
          step="1"
          [value]="zoomValue()"
          [attr.aria-valuetext]="zoomText()"
          (input)="onZoomInput($event)"
        />
        <span class="tm-zoom-text" aria-hidden="true">{{ zoomText() }}</span>
        <button
          type="button"
          class="tm-btn"
          [attr.aria-disabled]="canResetZoom() ? null : 'true'"
          (click)="canResetZoom() && resetZoom.emit()"
        >
          Reset zoom
        </button>
      </div>

      @if (presets().length) {
        <div class="tm-presets">
          <label [for]="id + '-preset'">Range</label>
          <select [id]="id + '-preset'" (change)="onPresetChange($event)">
            <option value="" [selected]="presetIndex() < 0">(current view)</option>
            @for (p of presets(); track $index) {
              <option [value]="$index" [selected]="$index === presetIndex()">{{ p.label }}</option>
            }
          </select>
        </div>
      }

      @if (customOpen()) {
        <tm-timeline-custom-range
          [parser]="parser()"
          [initialMin]="customMin()"
          [initialMax]="customMax()"
          (applied)="customApply.emit($event)"
          (closed)="customClose.emit()"
        />
      }

      <span class="tm-view-text">{{ viewText() }}</span>
    </div>
  `,
  styles: [
    TIMELINE_CONTROL_STYLES,
    `
      :host {
        display: block;
      }
      .tm-toolbar {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 0.5rem 1rem;
        padding: 0.5rem;
        border-top: 1px solid var(--tm-control-border);
        font-size: 0.875rem;
      }
      .tm-zoom,
      .tm-presets {
        display: flex;
        align-items: center;
        gap: 0.375rem;
      }
      label {
        color: var(--tm-muted);
      }
      input[type='range'] {
        width: 10rem;
        accent-color: var(--tm-accent-color);
      }
      .tm-zoom-text {
        min-width: 3.5rem;
        font-variant-numeric: tabular-nums;
        color: var(--tm-muted);
      }
      select {
        font: inherit;
        padding: 0.25rem;
        color: var(--tm-control-fg);
        background: var(--tm-control-bg);
        border: 1px solid var(--tm-control-border);
        border-radius: 4px;
      }
      .tm-badge {
        display: inline-block;
        min-width: 1.25rem;
        margin-inline-start: 0.25rem;
        padding: 0 0.25rem;
        border-radius: 999px;
        background: var(--tm-selection-color);
        color: var(--tm-selection-text);
        font-size: 0.75rem;
        text-align: center;
      }
      .tm-view-text {
        margin-inline-start: auto;
        color: var(--tm-muted);
        font-variant-numeric: tabular-nums;
      }
    `,
  ],
})
export class TimelineToolbarComponent {
  protected readonly id = `tm-toolbar-${nextId++}`;
  protected readonly steps = TIMELINE_ZOOM_STEPS;

  /** The count of selected points. */
  public readonly selectionCount = input(0);
  /** The zoom slider value (0 to TIMELINE_ZOOM_STEPS). */
  public readonly zoomValue = input(0);
  /** The human-friendly zoom level text. */
  public readonly zoomText = input('1×');
  /** True if the zoom can be reset. */
  public readonly canResetZoom = input(false);
  /** The preset ranges. */
  public readonly presets = input<DecoratedTimelineRange[]>([]);
  /** The index of the preset matching the current view, or -1. */
  public readonly presetIndex = input(-1);
  /** True to show the custom range form. */
  public readonly customOpen = input(false);
  /** The parser used for the custom range. */
  public readonly parser = input.required<TimelineParser>();
  /** The initial text of the custom range min. */
  public readonly customMin = input('');
  /** The initial text of the custom range max. */
  public readonly customMax = input('');
  /** The text describing the current view range. */
  public readonly viewText = input('');

  public readonly clearSelection = output<void>();
  public readonly zoomChange = output<number>();
  public readonly resetZoom = output<void>();
  public readonly presetSelect = output<number>();
  public readonly customApply = output<TimelineRange>();
  public readonly customClose = output<void>();

  protected onZoomInput(event: Event): void {
    this.zoomChange.emit(Number((event.target as HTMLInputElement).value));
  }

  protected onPresetChange(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    if (value !== '') {
      this.presetSelect.emit(Number(value));
    }
  }
}
