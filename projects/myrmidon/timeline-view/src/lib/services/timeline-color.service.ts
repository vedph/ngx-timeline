import { inject, Service } from '@angular/core';
import { ColorMap, ColorNameService, ColorService } from '@myrmidon/ngx-tools';

import { TimelinePointWithId } from '../models';

/**
 * The resolved colors of a timeline point. Undefined values mean that the
 * themed defaults (CSS variables) apply.
 */
export interface TimelinePointColors {
  fill?: string;
  text?: string;
}

/**
 * The special color value requesting an automatic color.
 */
export const TIMELINE_AUTO_COLOR = 'auto';

/**
 * Service resolving the fill and text colors of timeline points.
 */
@Service()
export class TimelineColorService {
  private readonly _colors = inject(ColorService);
  private readonly _names = inject(ColorNameService);

  /**
   * Get the contrast color (black or white) for the specified CSS color.
   *
   * @param color A hex color or a color name.
   * @returns The contrast color, or undefined if the color cannot be
   * resolved (e.g. it is a CSS variable or a transparent color).
   */
  public getContrastColor(color: string): string | undefined {
    const hex = this._names.normalizeColor(color);
    if (!hex || hex === 'transparent' || !this._colors.getRgb(hex)) {
      return undefined;
    }
    return this._colors.getContrastColor(hex);
  }

  /**
   * Resolve the colors of all the specified points. Points with the `auto`
   * color are assigned a palette color using their ID as the key; keys are
   * assigned in ascending ID order, so that the same set of points always
   * gets the same colors.
   *
   * @param points The points.
   * @returns A map where each key is a point ID.
   */
  public resolve(
    points: readonly TimelinePointWithId[],
  ): Map<number, TimelinePointColors> {
    const result = new Map<number, TimelinePointColors>();
    const autoIds = points
      .filter((p) => p.color?.trim().toLowerCase() === TIMELINE_AUTO_COLOR)
      .map((p) => p.id)
      .sort((a, b) => a - b);
    const map = new ColorMap();
    for (const id of autoIds) {
      map.getColorForKey(String(id));
    }

    for (const p of points) {
      const color = p.color?.trim();
      if (!color) {
        continue;
      }
      const fill =
        color.toLowerCase() === TIMELINE_AUTO_COLOR
          ? map.getColorForKey(String(p.id))
          : color;
      result.set(p.id, { fill, text: this.getContrastColor(fill) });
    }
    return result;
  }
}
