import { Component, computed, input } from '@angular/core';

import { TimelineOrientation } from '../models';

/**
 * A positioned ruler tick.
 */
export interface TimelineRulerTick {
  /** A unique key. */
  key: string;
  /** The position along the axis, in pixels. */
  pos: number;
  major: boolean;
  label?: string;
}

const MAJOR_TICK = 9;
const MINOR_TICK = 4;
const LABEL_GAP = 3;

/**
 * The timeline ruler, rendered as an SVG group. It is decorative (hidden
 * from assistive technologies), as the view range is announced elsewhere.
 */
@Component({
  selector: 'g[tmTimelineRuler]',
  template: `
    @let h = orientation() === 'horizontal';
    <svg:line
      class="tm-ruler-line"
      [attr.x1]="h ? start() : base()"
      [attr.y1]="h ? base() : start()"
      [attr.x2]="h ? end() : base()"
      [attr.y2]="h ? base() : end()"
    />
    @for (t of ticks(); track t.key) {
      @let len = t.major ? majorLength : minorLength;
      <svg:line
        class="tm-ruler-tick"
        [class.tm-ruler-major]="t.major"
        [attr.x1]="h ? t.pos : base()"
        [attr.y1]="h ? base() : t.pos"
        [attr.x2]="h ? t.pos : base() + dir() * len"
        [attr.y2]="h ? base() + dir() * len : t.pos"
      />
      @if (t.label) {
        <svg:text
          class="tm-ruler-label"
          [attr.x]="h ? t.pos : labelPos()"
          [attr.y]="h ? labelPos() : t.pos"
          [attr.text-anchor]="h ? 'middle' : dir() > 0 ? 'start' : 'end'"
          [attr.dominant-baseline]="h ? (dir() > 0 ? 'hanging' : 'auto') : 'central'"
        >
          {{ t.label }}
        </svg:text>
      }
    }
  `,
  styles: `
    .tm-ruler-line,
    .tm-ruler-tick {
      stroke: var(--tm-muted);
      stroke-width: 1;
      opacity: 0.7;
    }
    .tm-ruler-major {
      opacity: 1;
    }
    .tm-ruler-label {
      fill: var(--tm-muted);
      font-size: 10px;
      user-select: none;
    }
  `,
  host: {
    class: 'tm-ruler',
    'aria-hidden': 'true',
  },
})
export class TimelineRulerComponent {
  protected readonly majorLength = MAJOR_TICK;
  protected readonly minorLength = MINOR_TICK;

  /** The ticks to draw. */
  public readonly ticks = input<TimelineRulerTick[]>([]);
  /** The orientation of the timeline. */
  public readonly orientation = input<TimelineOrientation>('horizontal');
  /** The position of the ruler line on the perpendicular coordinate. */
  public readonly base = input(0);
  /** The direction where ticks and labels grow from the ruler line: 1 or -1. */
  public readonly dir = input<1 | -1>(1);
  /** The start of the ruler line along the axis. */
  public readonly start = input(0);
  /** The end of the ruler line along the axis. */
  public readonly end = input(0);

  protected readonly labelPos = computed(
    () => this.base() + this.dir() * (MAJOR_TICK + LABEL_GAP),
  );
}
