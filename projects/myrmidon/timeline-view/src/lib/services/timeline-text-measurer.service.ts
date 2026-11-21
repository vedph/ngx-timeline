import { Service } from '@angular/core';

type MeasureContext = Pick<OffscreenCanvasRenderingContext2D, 'font' | 'measureText'>;

/**
 * The average width of a character relative to the font size, used when no
 * canvas is available (e.g. server-side rendering or test environments).
 */
const AVG_CHAR_WIDTH = 0.6;
const ELLIPSIS = '…';
const MAX_CACHE = 5000;

/**
 * Service measuring the width of text in SVG labels, and truncating text to
 * fit a maximum width. When a canvas is available, measures are exact;
 * otherwise, they are estimated from the font size.
 */
@Service()
export class TimelineTextMeasurer {
  private _ctx: MeasureContext | null | undefined;
  private readonly _cache = new Map<string, number>();

  private getContext(): MeasureContext | null {
    if (this._ctx === undefined) {
      try {
        this._ctx =
          typeof OffscreenCanvas !== 'undefined'
            ? new OffscreenCanvas(1, 1).getContext('2d')
            : null;
      } catch {
        this._ctx = null;
      }
    }
    return this._ctx;
  }

  /**
   * Measure the width of the specified text.
   *
   * @param text The text.
   * @param fontSize The font size in pixels.
   * @param fontFamily The font family.
   */
  public measure(text: string, fontSize: number, fontFamily = 'sans-serif'): number {
    if (!text) {
      return 0;
    }
    const font = `${fontSize}px ${fontFamily}`;
    const key = font + '\u0000' + text;
    const cached = this._cache.get(key);
    if (cached !== undefined) {
      return cached;
    }
    const ctx = this.getContext();
    let width: number;
    if (ctx) {
      ctx.font = font;
      width = ctx.measureText(text).width;
    } else {
      width = text.length * fontSize * AVG_CHAR_WIDTH;
    }
    if (this._cache.size >= MAX_CACHE) {
      this._cache.clear();
    }
    this._cache.set(key, width);
    return width;
  }

  /**
   * Truncate the specified text with an ellipsis so that it fits the
   * specified width.
   *
   * @returns The text (truncated if required) and its width.
   */
  public truncate(
    text: string,
    maxWidth: number,
    fontSize: number,
    fontFamily = 'sans-serif',
  ): { text: string; width: number } {
    const full = this.measure(text, fontSize, fontFamily);
    if (full <= maxWidth) {
      return { text, width: full };
    }
    // binary search the longest prefix fitting with the ellipsis
    let lo = 0;
    let hi = text.length;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      const w = this.measure(text.slice(0, mid) + ELLIPSIS, fontSize, fontFamily);
      if (w <= maxWidth) {
        lo = mid;
      } else {
        hi = mid - 1;
      }
    }
    const result = lo > 0 ? text.slice(0, lo).trimEnd() + ELLIPSIS : ELLIPSIS;
    return { text: result, width: this.measure(result, fontSize, fontFamily) };
  }
}
