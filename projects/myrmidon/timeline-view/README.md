# @myrmidon/timeline-view

An interactive, SVG-based timeline view for Angular 22+: zoneless, signal-based, themeable and accessible.

- [@myrmidon/timeline-view](#myrmidontimeline-view)
  - [Features](#features)
  - [Installation](#installation)
  - [Quick Start](#quick-start)
  - [Concepts](#concepts)
    - [Points and Values](#points-and-values)
    - [Ranges](#ranges)
    - [Total Range and View Range](#total-range-and-view-range)
    - [Proportional vs. Fixed Step](#proportional-vs-fixed-step)
    - [Layout: Tiers and Groups](#layout-tiers-and-groups)
    - [Selection](#selection)
    - [Parsing and Formatting Values](#parsing-and-formatting-values)
    - [Colors](#colors)
  - [Usage](#usage)
    - [Two-way Binding](#two-way-binding)
    - [Dates](#dates)
    - [Preset and Custom Ranges](#preset-and-custom-ranges)
    - [Highlighted Ranges](#highlighted-ranges)
    - [Programmatic Control](#programmatic-control)
    - [Virtual Data (Loading on Demand)](#virtual-data-loading-on-demand)
    - [Theming](#theming)
  - [User Interaction](#user-interaction)
  - [Accessibility](#accessibility)
  - [Reference](#reference)
    - [TimelineComponent](#timelinecomponent)
    - [Models](#models)
    - [Services](#services)
    - [Utilities](#utilities)
    - [CSS Variables](#css-variables)
  - [Design Notes](#design-notes)
  - [Development](#development)

## Features

- horizontal or vertical timelines, sorted in ascending or descending order.
- points placed proportionally to their value, or at a fixed distance.
- points on one side of the axis or alternating on both sides. They are stacked in tiers to use all the available space, and grouped only when they would overlap.
- smooth _semantic_ zoom and scroll. Labels never scale: they are redrawn at constant size. Zoom with the mouse wheel, trackpad or touch pinch, or the slider; scroll by dragging, with the arrow keys or with the scroll buttons.
- optional ruler with major and minor ticks.
- single, range or sparse selection.
- preset view ranges, including a custom range typed by users and parsed by a pluggable parser.
- highlighted (background) ranges.
- optional _virtual data_: points loaded on demand from a service while zooming and scrolling, for timelines with many thousands of points.
- fills its container and adapts to resizing.
- themed via CSS variables, with automatic light/dark defaults.
- keyboard accessible, with a roving tab stop, ARIA toggle buttons and live announcements.

## Installation

```bash
npm i @myrmidon/timeline-view @myrmidon/ngx-tools
```

Peer dependencies: `@angular/core`, `@angular/common`, `@angular/forms` (v22+) and `@myrmidon/ngx-tools` (used for color computations).

## Quick Start

```ts
import { Component, signal } from '@angular/core';
import { TimelineComponent, TimelinePoint } from '@myrmidon/timeline-view';

@Component({
  selector: 'app-events',
  imports: [TimelineComponent],
  template: `
    <div class="frame">
      <tm-timeline [points]="points" ruler [(selection)]="selection" />
    </div>
  `,
  styles: `
    .frame {
      height: 400px;
    }
  `,
})
export class EventsComponent {
  protected readonly points: TimelinePoint[] = [
    { label: 'Rome founded', value: -753 },
    { label: 'Fall of the West', value: 476, color: 'auto' },
    { label: 'Columbus', value: 1492, shape: 'oval', tip: 'Columbus reaches the Americas' },
  ];
  protected readonly selection = signal<TimelinePoint[]>([]);
}
```

The component fills its container (`width: 100%; height: 100%`), so give the container a size. Its minimum height is `10rem`.

## Concepts

### Points and Values

A `TimelinePoint` has a numeric `value` and a human-friendly `label`. The component does not know what values mean: it can be years, Julian days, Unix timestamps, or any other number computed by your code. This keeps the component independent of calendars and time zones.

If a point has no `id`, the component assigns its 1-based ordinal position in the `points` array. Points emitted in `selectionChange` always carry their IDs.

### Ranges

A `TimelineRange` has a `start` and an `end` point. Only their `value` and `label` matter, so `{ label: '1492', value: 1492 }` is a valid range bound. A `DecoratedTimelineRange` adds a `label` and an optional `color`. It is used for preset and highlighted ranges.

### Total Range and View Range

- the **total range** (`timelineRange`) is the full extent the user can scroll and zoom through. When not set, it goes from the minimum to the maximum point.
- the **view range** (`viewRange`) is the part currently displayed. When undefined, the whole total range is displayed. Zooming and scrolling always keep the view inside the total range. A view range set from outside is clamped when displayed.

The zoom level is the ratio between the total span and the view span. It goes from 1 to `maxZoom`.

### Proportional vs. Fixed Step

By default, a point's position is proportional to its value. When `fixedStep` is true, every point gets an equally spaced _slot_ in value order, whatever its value. This is useful when values are unevenly distributed (e.g. many recent events and few ancient ones).

In both modes, all the public APIs (view range, presets, highlights, parser) are expressed in **values**. In fixed-step mode, values between two points are interpolated between their slots, and values beyond the extremes are extrapolated using the average distance between points. So a view range like "1400–1500" still means the same thing in both modes. Internally this is handled by `TimelineProjection`.

### Layout: Tiers and Groups

Each point is drawn as a rectangle or oval containing its label (truncated with an ellipsis beyond `maxLabelWidth`, with the full text in the tooltip). It is attached to the axis by a perpendicular connector.

Points are laid out along the axis in order. Each point goes in the _tier_ nearest to the axis where it does not overlap others. In `alternating` layout, sides alternate, and the other side is tried before moving farther away. The number of tiers depends on the available space. Only when no tier is free is a point merged with the previous item into a **group marker**. The marker shows the count of points and a bracket on the axis covering them, and its tooltip lists the grouped labels.

Activating a group zooms into it. If its points cannot be separated (identical values, or maximum zoom reached), activating it instead adds them to the selection (in `range` and `sparse` modes).

Only the points inside the view (plus a small margin) are rendered, and the layout is recomputed only when inputs, size or view change, so large datasets stay fluid.

### Selection

The selection is the list of selected points. It is two-way bindable, and its behavior depends on `selectionMode`:

| mode     | clicking an unselected point        | clicking a selected point                                                     |
| -------- | ----------------------------------- | ----------------------------------------------------------------------------- |
| `single` | selects it alone                    | deselects it                                                                  |
| `sparse` | adds it                             | removes it                                                                    |
| `range`  | extends the contiguous run up to it | at the run's edge: removes it; inside the run: restarts the selection from it |

In `range` mode, contiguity follows value order over _all_ points, including those outside the view. Selected points are returned in value order. Incoming selection items are matched by `id` (or by object reference for points without an ID).

### Parsing and Formatting Values

A `TimelineParser` converts text into values, and optionally values into text:

```ts
interface TimelineParser {
  parse(text: string): TimelineRange | null;
  format?(value: number, step?: number): string;
}
```

`parse` returns a _range_ because a textual time usually has a granularity: "1492" may mean the whole year, and "15th c." means 1401–1500. For an exact value, return a range with equal start and end. Return `null` for invalid text.

`format` is used for ruler labels, view bounds and the custom range prefill. `step` is the approximate resolution required (e.g. the distance between ticks). The output of `format` should be parseable by `parse`.

The parser is resolved as follows: the `parser` input, then the `TIMELINE_PARSER` injection token, then the built-in `NumericTimelineParser`, which accepts plain numbers.

### Colors

- no `color`: the point uses the theme (`--tm-point-fill`, `--tm-point-text`).
- a hex or named CSS color: the shape is filled with it, and the label is black or white, whichever contrasts best (computed with `@myrmidon/ngx-tools`).
- `auto`: a distinct pastel color from `ColorMap`, keyed by point ID. Colors are stable for the same set of points.

Other CSS color syntaxes (e.g. `var(--x)`, `rgb()`) are applied as they are, with the themed text color.

## Usage

### Two-way Binding

`selection` and `viewRange` are `model()` signals:

```html
<tm-timeline [points]="points()" [(selection)]="selection" [(viewRange)]="view" />
```

or with explicit events:

```html
<tm-timeline
  [points]="points()"
  [viewRange]="view()"
  (viewRangeChange)="onView($event)"
  [selection]="selection()"
  (selectionChange)="onSelection($event)"
/>
```

`viewRangeChange` fires on every zoom or scroll step, also while dragging or wheeling. Debounce it in your code if you trigger expensive work. To fetch points as the view changes, prefer a [data source](#virtual-data-loading-on-demand), which already debounces requests and loads only what is missing.

### Dates

Map dates to numbers in your code, and provide a parser that formats them back:

```ts
const DAY = 86_400_000;

export class IsoDateParser implements TimelineParser {
  parse(text: string): TimelineRange | null {
    const m = text.trim().match(/^(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?$/);
    if (!m) return null;
    const [y, mo, d] = [
      Number(m[1]),
      m[2] ? Number(m[2]) - 1 : undefined,
      m[3] ? Number(m[3]) : undefined,
    ];
    const start = Date.UTC(y, mo ?? 0, d ?? 1) / DAY;
    const end =
      (d !== undefined
        ? start * DAY + DAY
        : mo !== undefined
          ? Date.UTC(y, mo + 1, 1)
          : Date.UTC(y + 1, 0, 1)) /
        DAY -
      1;
    return {
      start: { label: this.format(start), value: start },
      end: { label: this.format(end), value: end },
    };
  }
  format(value: number): string {
    return new Date(Math.round(value) * DAY).toISOString().slice(0, 10);
  }
}
```

```html
<tm-timeline [points]="points" [parser]="dateParser" ruler />
```

To provide a parser to all the timelines in a subtree:

```ts
providers: [{ provide: TIMELINE_PARSER, useClass: IsoDateParser }];
```

### Preset and Custom Ranges

When `presetRanges` is not empty, the toolbar shows a **Range** dropdown. Picking a preset sets the view range to it. The dropdown shows the preset matching the current view, if any.

A preset whose start and end values are both `0` is a **custom** preset. Picking it shows _From_ and _To_ text boxes. Each is parsed with the parser, and the view goes from the start of the _From_ range to the end of the _To_ range. The form validates as you type: unparseable text and an end preceding the start are reported.

```ts
presets: DecoratedTimelineRange[] = [
  { label: 'Middle Ages', start: { label: '476', value: 476 }, end: { label: '1492', value: 1492 } },
  { label: 'Custom…', start: { label: '', value: 0 }, end: { label: '', value: 0 } },
];
```

### Highlighted Ranges

`hiliteRanges` draws background bands with their label. The band uses the range's `color` (or `--tm-hilite-fill`) at `--tm-hilite-opacity`.

```ts
hilites: DecoratedTimelineRange[] = [
  { label: 'Renaissance', color: '#ff9db0', start: { label: '1400', value: 1400 }, end: { label: '1600', value: 1600 } },
];
```

### Programmatic Control

Get the component with `viewChild(TimelineComponent)` and call its public methods:

```ts
private readonly timeline = viewChild.required(TimelineComponent);

zoomIn() { this.timeline().zoomIn(); }
focus(value: number) { this.timeline().centerOn(value); }
```

Alternatively, just set `viewRange`.

### Virtual Data (Loading on Demand)

With many thousands of points, loading all of them upfront can be slow. Instead, the timeline can load points from a **data source** as the user zooms and scrolls. Only the points needed for the view are requested, and each part of the timeline is requested only once.

#### How It Works

1. you give the timeline a `dataSource`, an explicit `timelineRange` (the total extent of your data), and an initial `viewRange` covering a small part of it.
2. the timeline computes the _load target_: the view, plus a margin of `loadMargin` × the view span on each side (default 0.5, i.e. half a view before and after), so that small scrolls need no request.
3. it subtracts from the target the ranges already loaded and those being loaded, and calls `getPoints` once for each remaining gap. For example, after loading 1400–1500, scrolling to 1450–1550 requests only 1500–1550.
4. while any request is in flight, a progress bar is shown at the top of the plot, and the plot has `aria-busy="true"`.
5. received points are cached and displayed as soon as they arrive. Points are deduplicated by `id`.

Requests are **debounced**: while the view keeps changing (dragging, wheeling, pinching), nothing is requested. The missing gaps are requested once the view stays still for `loadDebounce` milliseconds (default 300). The first load, and the first load after the data source changes, are immediate.

Requests in flight are **not** cancelled when the view changes, because their results are still valid and will be cached. They are aborted (via the `AbortSignal` passed to `getPoints`) only when the data source changes, when `reload()` is called, and when the timeline is destroyed. Late results of aborted requests are ignored.

If a request fails, `loadError` is emitted and its range is not marked as loaded, so it is requested again at the next view change.

When the view is zoomed out to the whole timeline, the whole timeline is needed, so everything would be loaded. To prevent this, set `maxLoadSpan` (in value units): when the view is wider than it, nothing is loaded, and the timeline shows (and announces) the message "Zoom in to load the points". The margin is also reduced so that the load target is never wider than `maxLoadSpan`. Points already loaded stay visible.

#### Example

```ts
const range = (start: number, end: number): TimelineRange => ({
  start: { label: String(start), value: start },
  end: { label: String(end), value: end },
});

@Component({
  selector: 'app-archive',
  imports: [TimelineComponent],
  template: `
    <tm-timeline
      [dataSource]="source"
      [timelineRange]="total"
      [(viewRange)]="view"
      [maxLoadSpan]="300"
      (loadError)="onLoadError($event)"
      ruler
    />
  `,
})
export class ArchiveComponent {
  protected readonly source = inject(ArchiveTimelineSource);
  // required: the total range does not depend on the loaded points
  protected readonly total: TimelineRange = range(-3000, 2025);
  // start with a small part of the timeline
  protected readonly view = signal<TimelineRange | undefined>(range(1400, 1500));

  protected onLoadError(e: TimelineDataError): void {
    console.error(`Could not load ${e.range.start.label}–${e.range.end.label}`, e.error);
  }
}
```

When `dataSource` is set:

- the `points` input is ignored.
- `timelineRange` should be set. Otherwise, the total range would be computed from the points loaded so far, and change while loading (a warning is logged in development mode).
- `fixedStep` is not applied, because the position of each point would depend on all the points, including those not loaded yet, and would shift while loading.
- in `range` selection mode, contiguity is computed over the loaded points.
- loaded points are never evicted, so memory grows with the explored part of the timeline. Call `reload()` to discard them, e.g. when the data behind the source changed. Replacing the `dataSource` with another object discards them too, so keep the same instance as long as the data do not change.

#### Implementing a Data Source

A data source implements `TimelineDataSource`, whose single method returns the points inside a range:

```ts
interface TimelineDataSource {
  getPoints(
    range: TimelineRange,
    signal: AbortSignal,
  ): Promise<TimelinePoint[]> | TimelineSubscribable<TimelinePoint[]>;
}
```

The timeline does all the bookkeeping (what is loaded, what is missing, debouncing, deduplication), so a data source can be stateless: just query your backend for the points in the range. The rules are:

- return the points with `range.start.value <= value <= range.end.value`. Bounds are inclusive, so a point on the boundary between two requests may be returned twice: this is harmless.
- every point **must** have a unique and stable `id`. Points with an ID already received are ignored. Points without an ID get a unique negative ID, but cannot be deduplicated.
- return a `Promise`, or a subscribable such as an RxJS `Observable` (`TimelineSubscribable` is a minimal interface, structurally compatible with `Observable`, so the library does not depend on RxJS). An observable may emit several batches (e.g. pages): each batch is displayed as it arrives, and the range is marked as loaded when the observable completes. With an observable, the timeline unsubscribes when the request is aborted.
- honor the `signal` to cancel work which is no longer needed (e.g. pass it to `fetch`).
- reject the promise (or error the observable) on failures. Points emitted before an error are kept, but the range is requested again later.
- `range.start.label` and `range.end.label` are formatted with the timeline's parser, if you need them. Use the `value`s for queries.

A data source using `fetch`:

```ts
@Service()
export class ArchiveTimelineSource implements TimelineDataSource {
  public async getPoints(range: TimelineRange, signal: AbortSignal): Promise<TimelinePoint[]> {
    const url = `/api/events?from=${range.start.value}&to=${range.end.value}`;
    const response = await fetch(url, { signal });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const events: { id: number; title: string; year: number }[] = await response.json();
    return events.map((e) => ({ id: e.id, label: e.title, value: e.year }));
  }
}
```

A data source using Angular's `HttpClient`, which returns an observable (unsubscribing cancels the HTTP request, so the signal can be ignored):

```ts
@Service()
export class ArchiveTimelineSource implements TimelineDataSource {
  private readonly _http = inject(HttpClient);

  public getPoints(range: TimelineRange): Observable<TimelinePoint[]> {
    return this._http
      .get<ArchiveEvent[]>('/api/events', {
        params: { from: range.start.value, to: range.end.value },
      })
      .pipe(map((events) => events.map((e) => ({ id: e.id, label: e.title, value: e.year }))));
  }
}
```

On the server side, an index on the value column makes range queries fast. Since a wide view can contain many points, consider limiting the result size there too, or setting `maxLoadSpan` on the timeline.

The demo app includes a mock data source (`src/app/mock-timeline-data-source.ts`) simulating a service with 50,000 points, a configurable latency and random failures. It uses `lowerBound` and `upperBound` (exported by this library) to slice its sorted points.

Under the hood, the component uses `TimelineDataLoader`, a plain class exported for reuse and testing, which implements the caching, the gap computation (`getIntervalGaps`, `mergeIntervals`), the debouncing and the cancellation.

### Theming

All colors come from CSS custom properties defined on the `tm-timeline` host. Their defaults use `light-dark()`, so they follow the `color-scheme` of the page. Set `color-scheme: light dark` (or `dark`) on a container or on `:root` to get dark defaults. To customize, override the variables:

```css
tm-timeline {
  --tm-point-fill: #eef6ee;
  --tm-point-stroke: #2e7d32;
  --tm-selection-color: #ad1457;
  --tm-font-family: 'Inter', sans-serif;
}
```

See [CSS Variables](#css-variables) for the full list. When overriding, keep text/background contrast at WCAG AA levels (4.5:1).

## User Interaction

| action                     | mouse / touch                                                                   | keyboard (focus inside the plot)                            |
| -------------------------- | ------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| toggle a point's selection | click / tap                                                                     | `Enter` or `Space`                                          |
| zoom into a group          | click / tap                                                                     | `Enter` or `Space`                                          |
| move between items         | –                                                                               | `Ctrl`/`Cmd`+arrow keys, `Home`, `End`                      |
| scroll                     | drag, `Shift`+wheel, horizontal trackpad swipe, scroll buttons at the axis ends | arrow keys (10% of the view), `Page Up` / `Page Down` (25%) |
| zoom                       | mouse wheel (around the pointer), trackpad pinch, touch pinch, toolbar slider   | `+` / `-` (around the focused item)                         |
| reset zoom                 | toolbar **Reset zoom**                                                          | `0`                                                         |
| clear selection            | toolbar **Clear selection**                                                     | –                                                           |

The mouse wheel zooms, keeping the value under the pointer fixed. When the zoom limit is already reached, the wheel event is left to the page, so the page can still scroll. All four arrow keys scroll: left/up go toward the start of the axis, right/down toward its end (with `descending` sort, the start of the axis holds the highest values). When `Ctrl`/`Cmd`+arrows reach the last visible item, the view scrolls to reveal the next ones. Drag gestures never toggle selection.

## Accessibility

- the plot is an SVG with `role="group"`, `aria-roledescription="timeline"`, the `label` input as accessible name, and a description of the keyboard commands.
- points are toggle buttons (`role="button"` with `aria-pressed`), named after their label and tip. Groups are buttons named "Group of N points, from A to B".
- points use a single _roving_ tab stop: `Tab` enters the timeline, the arrow keys scroll it and `Ctrl`/`Cmd`+arrows move between points. Focus stays inside the timeline when the focused item disappears because of zooming or scrolling.
- selection changes are announced through a polite live region.
- the toolbar uses native, labelled controls. Unavailable buttons use `aria-disabled` rather than `disabled`, so they don't lose focus.
- focus indicators use `--tm-focus-color`. The default colors meet WCAG AA contrast in both light and dark schemes.
- the ruler is decorative (`aria-hidden`), because the view range is shown as text in the toolbar.
- with a data source, loading is shown by an indeterminate `progressbar` named "Loading points", and the plot gets `aria-busy="true"`. The progress bar does not animate when `prefers-reduced-motion` is set. The "Zoom in to load the points" message is in a `status` live region.

## Reference

### TimelineComponent

Selector: `tm-timeline`.

**Inputs**

| name            | type                                               | default         | description                                                                                              |
| --------------- | -------------------------------------------------- | --------------- | -------------------------------------------------------------------------------------------------------- |
| `points`        | `readonly TimelinePoint[]`                         | `[]`            | the points to display.                                                                                   |
| `orientation`   | `'horizontal' \| 'vertical'`                       | `'horizontal'`  | the axis orientation.                                                                                    |
| `sort`          | `'ascending' \| 'descending'`                      | `'ascending'`   | ascending = values grow rightwards (horizontal) or downwards (vertical).                                 |
| `layout`        | `'leftOrAbove' \| 'rightOrBelow' \| 'alternating'` | `'alternating'` | the side(s) of the axis where points are placed.                                                         |
| `ruler`         | `boolean`                                          | `false`         | show a ruler: opposite to the points in single-side layouts, else above (horizontal) or left (vertical). |
| `selectionMode` | `'single' \| 'range' \| 'sparse'`                  | `'single'`      | the selection behavior.                                                                                  |
| `selection`     | `TimelinePoint[]` (model)                          | `[]`            | the selected points.                                                                                     |
| `viewRange`     | `TimelineRange \| undefined` (model)               | `undefined`     | the displayed range. Undefined = the whole timeline.                                                     |
| `timelineRange` | `TimelineRange \| undefined`                       | `undefined`     | the total range. Undefined = from the min to the max point.                                              |
| `fixedStep`     | `boolean`                                          | `false`         | place points at a fixed distance.                                                                        |
| `presetRanges`  | `DecoratedTimelineRange[]`                         | `[]`            | preset view ranges for the toolbar dropdown (`0`–`0` = custom).                                          |
| `hiliteRanges`  | `DecoratedTimelineRange[]`                         | `[]`            | background-highlighted ranges.                                                                           |
| `parser`        | `TimelineParser \| undefined`                      | `undefined`     | the parser for typed values and value formatting.                                                        |
| `maxZoom`       | `number`                                           | `200`           | the maximum zoom level. In fixed-step mode, also limited so that at least one slot is visible.           |
| `maxLabelWidth` | `number`                                           | `160`           | the maximum label width in pixels (labels are truncated beyond it).                                      |
| `label`         | `string`                                           | `'Timeline'`    | the accessible name of the timeline.                                                                     |
| `toolbar`       | `boolean`                                          | `true`          | show the toolbar.                                                                                        |
| `dataSource`    | `TimelineDataSource \| undefined`                  | `undefined`     | load points on demand from this source ([virtual data](#virtual-data-loading-on-demand)).                |
| `loadDebounce`  | `number`                                           | `300`           | the time (ms) the view must stay still before missing points are requested.                              |
| `loadMargin`    | `number`                                           | `0.5`           | the fraction of the view span loaded in advance on each side of the view.                                |
| `maxLoadSpan`   | `number \| undefined`                              | `undefined`     | the widest view span (in values) for which points are loaded. Undefined or 0 = no limit.                 |

**Outputs**

| name              | payload                      | description                                              |
| ----------------- | ---------------------------- | -------------------------------------------------------- |
| `selectionChange` | `TimelinePoint[]`            | the selection changed (points have their `id` set).      |
| `viewRangeChange` | `TimelineRange \| undefined` | the view range changed by zooming, scrolling or presets. |
| `loadError`       | `TimelineDataError`          | loading a range from the data source failed.             |

**Signals**

| name      | type              | description                                          |
| --------- | ----------------- | ---------------------------------------------------- |
| `loading` | `Signal<boolean>` | true while points are loaded from the data source.   |

**Methods**

| method                         | description                                                                 |
| ------------------------------ | --------------------------------------------------------------------------- |
| `zoomBy(factor, anchorValue?)` | zoom by a factor (>1 in, <1 out) around a value (default: the view center). |
| `zoomIn()` / `zoomOut()`       | zoom by one step (×1.5).                                                    |
| `resetZoom()`                  | display the whole timeline.                                                 |
| `scrollBy(fraction)`           | scroll by a fraction of the view span. Positive = toward higher values.     |
| `centerOn(value)`              | center the view on a value, keeping the zoom.                               |
| `clearSelection()`             | clear the selection.                                                        |
| `reload()`                     | discard the points loaded from the data source and load the view again.     |

### Models

- `TimelinePoint`: `{ id?: number; label: string; value: number; color?: string; shape?: 'rectangle' | 'oval'; tip?: string }`.
- `TimelinePointWithId`: a `TimelinePoint` with a required `id`.
- `TimelineRange`: `{ start: TimelinePoint; end: TimelinePoint }`.
- `DecoratedTimelineRange`: `TimelineRange & { label: string; color?: string }`.
- `TimelineParser`: `{ parse(text): TimelineRange | null; format?(value, step?): string }`.
- `TIMELINE_PARSER`: an injection token for a default parser.
- `TimelineDataSource`: `{ getPoints(range, signal): Promise<TimelinePoint[]> | TimelineSubscribable<TimelinePoint[]> }`.
- `TimelineSubscribable<T>`: a minimal subscribable, compatible with RxJS `Observable`.
- `TimelineDataError`: `{ range: TimelineRange; error: unknown }`.
- types: `TimelineOrientation`, `TimelineSort`, `TimelineLayout`, `TimelineSelectionMode`, `TimelinePointShape`.

### Services

- `TimelineColorService`: `resolve(points)` returns a map from point ID to `{ fill?, text? }`. `getContrastColor(color)` returns black or white.
- `TimelineTextMeasurer`: `measure(text, fontSize, fontFamily?)` and `truncate(text, maxWidth, fontSize, fontFamily?)`. It uses an `OffscreenCanvas` when available, and estimates widths otherwise (SSR and tests).

### Utilities

These are pure functions and classes, exported for reuse and testing:

- `NumericTimelineParser`, `formatTimelineNumber(value, step?)`.
- `TimelineProjection`: `linear()`, `fixed(sortedValues)`, `toU(value, bias?)`, `toValue(u)`.
- intervals: `clampInterval`, `zoomInterval`, `panInterval`, `intervalAtZoom`, `getZoomLevel`, `zoomToSlider`, `sliderToZoom`, `intervalsEqual`.
- ticks: `niceStep(raw, integer?)`, `computeTicks(start, end, majorCount, integer?, maxTicks?)`.
- layout: `layoutTimelineItems(entries, options)`, `getTierCount(...)`.
- selection: `toggleTimelineSelection(mode, ordered, current, target)`, `addToTimelineSelection(mode, ordered, current, targets)`.
- points: `normalizeTimelinePoints`, `sortTimelinePoints`, `compareTimelinePoints`, `isCustomTimelineRange`, `lowerBound`, `upperBound`.
- coverage: `mergeIntervals(intervals)`, `getIntervalGaps(target, covered, epsilon?)`.
- `TimelineDataLoader`: loads points on demand from a data source, with caching, gap computation, debouncing and cancellation (`update(source, target, debounceMs)`, `reload()`, `destroy()`, `points`, `loading`).
- `TIMELINE_METRICS`: the pixel metrics used for the layout (box height, paddings, gaps...).

The sub-components (`TimelineToolbarComponent`, `TimelineCustomRangeComponent`, `TimelineItemComponent`, `TimelineRulerComponent`) are exported too, but they are building blocks of `tm-timeline` rather than a stable public API.

### CSS Variables

| variable                                                                             | used for                         |
| ------------------------------------------------------------------------------------ | -------------------------------- |
| `--tm-bg`, `--tm-fg`                                                                 | background and text              |
| `--tm-muted`                                                                         | ruler, secondary text            |
| `--tm-axis-color`                                                                    | axis line and anchors            |
| `--tm-connector-color`                                                               | connectors                       |
| `--tm-point-fill`, `--tm-point-stroke`, `--tm-point-text`                            | default point colors             |
| `--tm-group-fill`, `--tm-group-stroke`, `--tm-group-text`                            | group markers and brackets       |
| `--tm-selection-color`, `--tm-selection-text`                                        | selected points, selection badge |
| `--tm-focus-color`                                                                   | focus indicators                 |
| `--tm-accent-color`                                                                  | slider, hovered scroll buttons   |
| `--tm-hilite-fill`, `--tm-hilite-opacity`                                            | highlighted ranges               |
| `--tm-scroll-color`                                                                  | scroll buttons                   |
| `--tm-control-fg`, `--tm-control-bg`, `--tm-control-hover-bg`, `--tm-control-border` | toolbar controls                 |
| `--tm-error-color`                                                                   | validation errors                |
| `--tm-font-family`                                                                   | font (default: inherited)        |

Font sizes are fixed (12px labels, 10px ruler) because they are part of the layout computations.

## Design Notes

- **Semantic zoom, no pan-zoom library.** Generic SVG pan/zoom libraries (e.g. `svg-pan-zoom`) scale the whole drawing, so labels and strokes grow or shrink and become unreadable. Here the view range drives a linear scale, and the SVG is redrawn at constant size. Gestures are handled with native pointer and wheel events, so there are no extra dependencies and it works zoneless.
- **Signals everywhere.** All derived state (projection, geometry, layout, ticks) is a chain of `computed()` signals. They are lazy and glitch-free, so separate inputs cannot cause intermediate inconsistent renders, and there is no need to group layout inputs into a single options object.
- **Value-based public API.** Whatever the projection mode, the API speaks in values. `TimelineProjection` hides the slot/value mapping.
- **The timeline owns the load bookkeeping.** A data source receives only the missing ranges, rather than the required and current ranges, so it does not need to know what the timeline already has. This keeps data sources stateless and trivial to write, and keeps caching, deduplication, debouncing and cancellation consistent and tested in one place (`TimelineDataLoader`).
- **Incremental measuring.** Label measurements are cached per point object, so when new points arrive only those are measured.
- **Signal Forms.** The custom range form uses `@angular/forms/signals` with schema validation.

## Development

In the workspace root:

```bash
pnpm ng build @myrmidon/timeline-view   # build the library into dist/
pnpm ng test @myrmidon/timeline-view    # run the unit tests (Vitest)
pnpm start                              # run the demo app
```

Component tests use [Angular Testing Library](https://github.com/testing-library/angular-testing-library) with `@testing-library/user-event`. Tests for services and utilities use plain Vitest with `TestBed`.
