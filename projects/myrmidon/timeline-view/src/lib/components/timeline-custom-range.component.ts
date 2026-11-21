import {
  Component,
  computed,
  input,
  linkedSignal,
  output,
  untracked,
} from '@angular/core';
import { form, FormField, required, validate } from '@angular/forms/signals';

import { TimelineParser, TimelineRange } from '../models';
import { TIMELINE_CONTROL_STYLES } from './timeline-control-styles';

let nextId = 0;

interface CustomRangeModel {
  min: string;
  max: string;
}

/**
 * A small form to type a custom view range. Each bound is parsed by the
 * timeline parser into a range; the resulting view range goes from the start
 * of the min range to the end of the max range.
 */
@Component({
  selector: 'tm-timeline-custom-range',
  imports: [FormField],
  template: `
    <form
      class="tm-custom-range"
      [attr.aria-label]="'Custom range'"
      (submit)="onSubmit($event)"
      novalidate
    >
      <div class="tm-field">
        <label [for]="id + '-min'">From</label>
        <input
          [id]="id + '-min'"
          type="text"
          autocomplete="off"
          [formField]="rangeForm.min"
          [attr.aria-invalid]="showMinError() ? 'true' : null"
          [attr.aria-describedby]="showMinError() ? id + '-min-error' : null"
        />
        @if (showMinError()) {
          <span class="tm-error" [id]="id + '-min-error'">
            {{ rangeForm.min().errors()[0]?.message }}
          </span>
        }
      </div>
      <div class="tm-field">
        <label [for]="id + '-max'">To</label>
        <input
          [id]="id + '-max'"
          type="text"
          autocomplete="off"
          [formField]="rangeForm.max"
          [attr.aria-invalid]="showMaxError() ? 'true' : null"
          [attr.aria-describedby]="showMaxError() ? id + '-max-error' : null"
        />
        @if (showMaxError()) {
          <span class="tm-error" [id]="id + '-max-error'">
            {{ rangeForm.max().errors()[0]?.message }}
          </span>
        }
      </div>
      <button
        type="submit"
        class="tm-btn"
        [attr.aria-disabled]="rangeForm().invalid() ? 'true' : null"
      >
        Apply
      </button>
      <button type="button" class="tm-btn" (click)="closed.emit()">Close</button>
    </form>
  `,
  styles: [
    TIMELINE_CONTROL_STYLES,
    `
    .tm-custom-range {
      display: flex;
      flex-wrap: wrap;
      align-items: flex-start;
      gap: 0.5rem;
      margin: 0;
    }
    .tm-field {
      display: flex;
      flex-direction: column;
      gap: 0.125rem;
    }
    .tm-field label {
      font-size: 0.75rem;
      color: var(--tm-muted);
    }
    input {
      width: 9rem;
      font: inherit;
      padding: 0.25rem 0.375rem;
      color: var(--tm-control-fg);
      background: var(--tm-control-bg);
      border: 1px solid var(--tm-control-border);
      border-radius: 4px;
    }
    input[aria-invalid='true'] {
      border-color: var(--tm-error-color);
    }
    input:focus-visible {
      outline: 2px solid var(--tm-focus-color);
      outline-offset: 1px;
    }
    .tm-error {
      font-size: 0.75rem;
      color: var(--tm-error-color);
      max-width: 9rem;
    }
    .tm-btn {
      align-self: flex-end;
    }
  `,
  ],
})
export class TimelineCustomRangeComponent {
  protected readonly id = `tm-custom-range-${nextId++}`;

  /** The parser used to parse the typed bounds. */
  public readonly parser = input.required<TimelineParser>();
  /** The initial text of the min bound. */
  public readonly initialMin = input('');
  /** The initial text of the max bound. */
  public readonly initialMax = input('');

  /** Emitted when the user applies a valid range. */
  public readonly applied = output<TimelineRange>();
  /** Emitted when the user closes the form. */
  public readonly closed = output<void>();

  // the model is reset only when the parser changes, so that panning or
  // zooming the timeline while typing does not overwrite the user's input
  private readonly _model = linkedSignal<TimelineParser, CustomRangeModel>({
    source: this.parser,
    computation: () => ({
      min: untracked(this.initialMin),
      max: untracked(this.initialMax),
    }),
  });

  protected readonly rangeForm = form(this._model, (p) => {
    required(p.min, { message: 'Enter a start value' });
    required(p.max, { message: 'Enter an end value' });
    validate(p.min, ({ value }) =>
      value() && !this.parser().parse(value())
        ? { kind: 'parse', message: 'Invalid value' }
        : undefined,
    );
    validate(p.max, ({ value, valueOf }) => {
      if (!value()) {
        return undefined;
      }
      const max = this.parser().parse(value());
      if (!max) {
        return { kind: 'parse', message: 'Invalid value' };
      }
      const min = this.parser().parse(valueOf(p.min));
      return min && max.end.value < min.start.value
        ? { kind: 'order', message: 'End precedes start' }
        : undefined;
    });
  });

  protected readonly showMinError = computed(() => {
    const f = this.rangeForm.min();
    return f.invalid() && (f.touched() || f.dirty());
  });

  protected readonly showMaxError = computed(() => {
    const f = this.rangeForm.max();
    return f.invalid() && (f.touched() || f.dirty());
  });

  protected onSubmit(event: Event): void {
    event.preventDefault();
    this.rangeForm.min().markAsTouched();
    this.rangeForm.max().markAsTouched();
    if (this.rangeForm().invalid()) {
      return;
    }
    const { min, max } = this._model();
    const a = this.parser().parse(min);
    const b = this.parser().parse(max);
    if (a && b) {
      this.applied.emit({ start: a.start, end: b.end });
    }
  }
}
