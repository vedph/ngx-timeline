import { Component, input, output } from '@angular/core';

import { TimelinePointShape, TimelinePointWithId } from '../models';
import { TimelineSegment } from '../utils/timeline-layout';

/**
 * The view model of a rendered timeline item (a point or a group of points).
 */
export interface TimelineRenderItem {
  key: string;
  kind: 'point' | 'group';
  shape: TimelinePointShape;
  x: number;
  y: number;
  width: number;
  height: number;
  /** The center of the box. */
  cx: number;
  cy: number;
  /** The displayed (possibly truncated) text. */
  text: string;
  fill?: string;
  textColor?: string;
  /** The tooltip. */
  title: string;
  ariaLabel: string;
  selected: boolean;
  connector: TimelineSegment;
  bracket?: TimelineSegment;
  /** The points represented by the item (1 for a point), in value order. */
  points: TimelinePointWithId[];
  /** The layout keys of the members. */
  memberKeys: string[];
  /** The minimum projection coordinate of the members. */
  uStart: number;
  /** The maximum projection coordinate of the members. */
  uEnd: number;
}

/**
 * The source of an item activation.
 */
export type TimelineActivationSource = 'pointer' | 'keyboard';

/**
 * A timeline item, i.e. a point or a group marker, rendered as an SVG group.
 * This is a toggle button: activating it toggles the point selection, or
 * zooms into the group.
 */
@Component({
  selector: 'g[tmTimelineItem]',
  template: `
    @let it = item();
    <svg:title>{{ it.title }}</svg:title>
    @if (it.kind === 'group') {
      <svg:rect
        class="tm-item-stack"
        [attr.x]="it.x + 3"
        [attr.y]="it.y - 3"
        [attr.width]="it.width"
        [attr.height]="it.height"
        [attr.rx]="it.height / 2"
      />
    }
    @if (it.shape === 'oval' && it.kind === 'point') {
      <svg:ellipse
        class="tm-item-shape"
        [attr.cx]="it.cx"
        [attr.cy]="it.cy"
        [attr.rx]="it.width / 2"
        [attr.ry]="it.height / 2"
        [style.fill]="it.fill"
      />
    } @else {
      <svg:rect
        class="tm-item-shape"
        [attr.x]="it.x"
        [attr.y]="it.y"
        [attr.width]="it.width"
        [attr.height]="it.height"
        [attr.rx]="it.kind === 'group' ? it.height / 2 : 4"
        [style.fill]="it.fill"
      />
    }
    <svg:rect
      class="tm-item-focus"
      [attr.x]="it.x - 3"
      [attr.y]="it.y - 3"
      [attr.width]="it.width + 6"
      [attr.height]="it.height + 6"
      [attr.rx]="it.shape === 'oval' || it.kind === 'group' ? (it.height + 6) / 2 : 6"
    />
    <svg:text
      class="tm-item-label"
      [attr.x]="it.cx"
      [attr.y]="it.cy"
      [style.fill]="it.textColor"
    >
      {{ it.text }}
    </svg:text>
  `,
  styles: `
    :host {
      cursor: pointer;
      outline: none;
    }
    .tm-item-shape {
      fill: var(--tm-point-fill);
      stroke: var(--tm-point-stroke);
      stroke-width: 1;
      transition: stroke-width 120ms ease;
    }
    :host(:hover) .tm-item-shape {
      stroke-width: 2;
    }
    .tm-item-stack {
      fill: var(--tm-group-fill);
      stroke: var(--tm-group-stroke);
      stroke-width: 1;
    }
    :host(.tm-item-group) .tm-item-shape {
      fill: var(--tm-group-fill);
      stroke: var(--tm-group-stroke);
    }
    :host(.tm-item-selected) .tm-item-shape {
      stroke: var(--tm-selection-color);
      stroke-width: 2.5;
    }
    .tm-item-label {
      fill: var(--tm-point-text);
      font-size: 12px;
      text-anchor: middle;
      dominant-baseline: central;
      pointer-events: none;
      user-select: none;
    }
    :host(.tm-item-group) .tm-item-label {
      fill: var(--tm-group-text);
      font-weight: 600;
    }
    :host(.tm-item-selected) .tm-item-label {
      font-weight: 600;
    }
    .tm-item-focus {
      fill: none;
      stroke: var(--tm-focus-color);
      stroke-width: 2;
      visibility: hidden;
      pointer-events: none;
    }
    :host(:focus-visible) .tm-item-focus {
      visibility: visible;
    }
  `,
  host: {
    class: 'tm-item',
    role: 'button',
    '[class.tm-item-group]': "item().kind === 'group'",
    '[class.tm-item-selected]': 'item().selected',
    '[attr.tabindex]': 'focusable() ? 0 : -1',
    '[attr.aria-pressed]': "item().kind === 'point' ? item().selected : null",
    '[attr.aria-label]': 'item().ariaLabel',
    '[attr.data-key]': 'item().key',
    '(click)': "activated.emit('pointer')",
    '(keydown.enter)': 'onKey($event)',
    '(keydown.space)': 'onKey($event)',
    '(focus)': 'itemFocus.emit()',
  },
})
export class TimelineItemComponent {
  /**
   * The item to render.
   */
  public readonly item = input.required<TimelineRenderItem>();

  /**
   * True if this item is the tab stop of the timeline (roving tabindex).
   */
  public readonly focusable = input(false);

  /**
   * Emitted when the item is activated by clicking it or by pressing
   * Enter or Space.
   */
  public readonly activated = output<TimelineActivationSource>();

  /**
   * Emitted when the item receives focus.
   */
  public readonly itemFocus = output<void>();

  protected onKey(event: Event): void {
    event.preventDefault();
    this.activated.emit('keyboard');
  }
}
