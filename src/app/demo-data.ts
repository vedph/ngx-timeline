import {
  DecoratedTimelineRange,
  TimelineParser,
  TimelinePoint,
  TimelinePointShape,
  TimelineRange,
} from '@myrmidon/timeline-view';

/**
 * A demo parser for historical years. Accepted formats:
 * - `1492`, `-500`, `500 BC`, `500 BCE`, `AD 800`, `800 CE`: a single year;
 * - `1450s`: a decade;
 * - `15th c.`, `15th century`, `5th c. BC`: a century;
 * - `1400-1450`, `1400 to 1450`: a span.
 * Years are numbers; BC years are negative (no year 0 handling for
 * simplicity).
 */
export class YearTimelineParser implements TimelineParser {
  private parseYear(text: string): number | null {
    const m = text
      .trim()
      .match(/^(?:(AD)\s*)?(-?\d{1,5})\s*(BCE?|AD|CE)?$/i);
    if (!m) {
      return null;
    }
    const n = Number(m[2]);
    return m[3] && /^BC/i.test(m[3]) ? -Math.abs(n) : n;
  }

  private range(start: number, end: number): TimelineRange {
    return {
      start: { label: this.format(start), value: start },
      end: { label: this.format(end), value: end },
    };
  }

  public parse(text: string): TimelineRange | null {
    const t = text?.trim();
    if (!t) {
      return null;
    }
    // span
    const span = t.match(/^(.+?)\s*(?:–|to|\.\.|(?<=\d)\s*-\s*(?=\d))\s*(.+)$/i);
    if (span) {
      const a = this.parse(span[1]);
      const b = this.parse(span[2]);
      return a && b ? this.range(a.start.value, b.end.value) : null;
    }
    // decade
    const decade = t.match(/^(\d{1,4})0s$/i);
    if (decade) {
      const start = Number(decade[1]) * 10;
      return this.range(start, start + 9);
    }
    // century
    const century = t.match(/^(\d{1,2})(?:st|nd|rd|th)\s*c(?:\.|entury)?\s*(BCE?)?$/i);
    if (century) {
      const c = Number(century[1]);
      return century[2]
        ? this.range(-c * 100, -(c - 1) * 100 - 1)
        : this.range((c - 1) * 100 + 1, c * 100);
    }
    const year = this.parseYear(t);
    return year === null ? null : this.range(year, year);
  }

  // years are always formatted as integers, so that the output is parseable
  public format(value: number): string {
    const v = Math.round(value);
    return v < 0 ? `${Math.abs(v)} BC` : String(v);
  }
}

const YEAR_PARSER = new YearTimelineParser();

function r(start: number, end: number, parser = YEAR_PARSER): TimelineRange {
  return {
    start: { label: parser.format(start), value: start },
    end: { label: parser.format(end), value: end },
  };
}

const CUSTOM: DecoratedTimelineRange = {
  label: 'Custom range…',
  start: { label: '', value: 0 },
  end: { label: '', value: 0 },
};

/**
 * A demo dataset.
 */
export interface DemoDataset {
  points: TimelinePoint[];
  presets: DecoratedTimelineRange[];
  hilites: DecoratedTimelineRange[];
  timelineRange?: TimelineRange;
  /** True if the dataset is about years and should use the year parser. */
  years: boolean;
  /** The initial view range, if any. */
  initialView?: TimelineRange;
  /** True if points are loaded on demand from a data source. */
  virtual?: boolean;
}

const HISTORY: [number, string, string][] = [
  [-776, 'First Olympiad', 'The first recorded Olympic games in Olympia.'],
  [-753, 'Rome founded', 'Traditional date of the foundation of Rome.'],
  [-509, 'Roman Republic', 'Expulsion of the last king of Rome.'],
  [-490, 'Marathon', 'The Athenians defeat the Persians at Marathon.'],
  [-431, 'Peloponnesian War', 'War between Athens and Sparta begins.'],
  [-336, 'Alexander king', 'Alexander becomes king of Macedon.'],
  [-264, 'First Punic War', 'Rome and Carthage go to war.'],
  [-44, 'Caesar murdered', 'Julius Caesar is assassinated.'],
  [-27, 'Augustus', 'Octavian receives the title of Augustus.'],
  [79, 'Vesuvius erupts', 'Pompeii and Herculaneum are buried.'],
  [117, 'Empire at its peak', 'Greatest extent of the Roman Empire under Trajan.'],
  [313, 'Edict of Milan', 'Tolerance for Christianity in the empire.'],
  [330, 'Constantinople', 'Constantine inaugurates his new capital.'],
  [410, 'Sack of Rome', 'The Visigoths sack Rome.'],
  [476, 'Fall of the West', 'Deposition of Romulus Augustulus.'],
  [529, 'Benedictine Rule', 'Benedict founds Montecassino.'],
  [622, 'Hegira', 'Muhammad moves from Mecca to Medina.'],
  [800, 'Charlemagne crowned', 'Charlemagne is crowned emperor in Rome.'],
  [962, 'Holy Roman Empire', 'Otto I is crowned emperor.'],
  [1054, 'East–West Schism', 'Split between Western and Eastern churches.'],
  [1066, 'Hastings', 'The Norman conquest of England.'],
  [1096, 'First Crusade', 'The first crusade begins.'],
  [1215, 'Magna Carta', 'King John seals the Magna Carta.'],
  [1265, 'Dante born', 'Dante Alighieri is born in Florence.'],
  [1348, 'Black Death', 'The plague devastates Europe.'],
  [1440, 'Printing press', 'Gutenberg develops movable type printing.'],
  [1453, 'Fall of Constantinople', 'The Ottomans conquer Constantinople.'],
  [1492, 'Columbus', 'Columbus reaches the Americas.'],
  [1517, 'Reformation', 'Luther posts his 95 theses.'],
  [1543, 'Copernicus', 'De revolutionibus is published.'],
  [1610, 'Sidereus Nuncius', "Galileo's telescopic observations."],
  [1648, 'Westphalia', 'Peace of Westphalia ends the Thirty Years War.'],
  [1687, 'Principia', "Newton's Principia is published."],
  [1776, 'US Independence', 'Declaration of Independence.'],
  [1789, 'French Revolution', 'Storming of the Bastille.'],
  [1815, 'Waterloo', 'Final defeat of Napoleon.'],
  [1848, 'Revolutions of 1848', 'A wave of revolutions across Europe.'],
  [1861, 'Italy unified', 'Proclamation of the Kingdom of Italy.'],
  [1914, 'World War I', 'The Great War begins.'],
  [1939, 'World War II', 'Germany invades Poland.'],
  [1969, 'Moon landing', 'Apollo 11 lands on the Moon.'],
  [1989, 'Berlin Wall falls', 'End of the division of Berlin.'],
];

const SHAPES: TimelinePointShape[] = ['rectangle', 'oval'];

/**
 * Get the history dataset (values are years).
 */
export function getHistoryDataset(): DemoDataset {
  return {
    years: true,
    points: HISTORY.map(([value, label, tip], i) => ({
      value,
      label,
      tip,
      shape: SHAPES[i % 7 === 0 ? 1 : 0],
    })),
    timelineRange: r(-800, 2000),
    hilites: [
      { label: 'Classical antiquity', ...r(-800, 476), color: '#7aa7ff' },
      { label: 'Middle Ages', ...r(476, 1492), color: '#ffcf5a' },
      { label: 'Renaissance', ...r(1400, 1600), color: '#ff9db0' },
      { label: 'Contemporary age', ...r(1789, 2000), color: '#8fe0a8' },
    ],
    presets: [
      { label: 'Antiquity', ...r(-800, 476) },
      { label: 'Middle Ages', ...r(476, 1492) },
      { label: 'Early modern', ...r(1492, 1789) },
      { label: 'Last two centuries', ...r(1800, 2000) },
      CUSTOM,
    ],
  };
}

/** The total range of the virtual dataset. */
export const VIRTUAL_RANGE = { start: -3000, end: 2025 };

/** The number of points in the virtual dataset. */
export const VIRTUAL_COUNT = 50_000;

/**
 * Get the virtual dataset: its points are loaded on demand from a data
 * source, so `points` is empty. The total range must be explicit, and the
 * initial view is a small part of it, so that only a few points are loaded
 * at startup.
 */
export function getVirtualDataset(): DemoDataset {
  return {
    years: true,
    virtual: true,
    points: [],
    timelineRange: r(VIRTUAL_RANGE.start, VIRTUAL_RANGE.end),
    initialView: r(1400, 1500),
    hilites: [
      { label: 'Bronze Age collapse', ...r(-1200, -1150), color: '#ffcf5a' },
      { label: 'Classical antiquity', ...r(-800, 476), color: '#7aa7ff' },
      { label: 'Renaissance', ...r(1400, 1600), color: '#ff9db0' },
    ],
    presets: [
      { label: 'Fifteenth century', ...r(1401, 1500) },
      { label: 'First century', ...r(1, 100) },
      { label: 'Last fifty years', ...r(1975, 2025) },
      { label: 'Whole millennium (not loaded)', ...r(1000, 2000) },
      CUSTOM,
    ],
  };
}

/**
 * A small deterministic pseudo-random generator (mulberry32).
 */
function random(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function numericRange(start: number, end: number): TimelineRange {
  return {
    start: { label: String(start), value: start },
    end: { label: String(end), value: end },
  };
}

/**
 * Get a dataset with random points in the 0-1000 range.
 */
export function getRandomDataset(count: number, seed = 42): DemoDataset {
  const rnd = random(seed);
  const points: TimelinePoint[] = Array.from({ length: count }, (_, i) => {
    const value = Math.round(rnd() * 10000) / 10;
    return {
      label: `#${i + 1}`,
      value,
      tip: `Point ${i + 1} at ${value}`,
      shape: SHAPES[i % 2],
    };
  });
  return {
    years: false,
    points,
    hilites: [
      { label: 'Warm-up', ...numericRange(0, 100) },
      { label: 'Peak', ...numericRange(450, 550), color: '#ff9db0' },
    ],
    presets: [
      { label: '0–100', ...numericRange(0, 100) },
      { label: '250–750', ...numericRange(250, 750) },
      { label: 'Last tenth', ...numericRange(900, 1000) },
      CUSTOM,
    ],
  };
}

/**
 * Get a dataset with dense clusters of points, including points with
 * identical values, to exercise grouping.
 */
export function getClustersDataset(): DemoDataset {
  const rnd = random(7);
  const points: TimelinePoint[] = [];
  const centers = [10, 35, 36, 60, 90];
  centers.forEach((c, ci) => {
    for (let i = 0; i < 12; i++) {
      const value = Math.round((c + (rnd() - 0.5) * 3) * 100) / 100;
      points.push({ label: `C${ci + 1}.${i + 1}`, value, tip: `Cluster ${ci + 1}` });
    }
  });
  for (let i = 0; i < 5; i++) {
    points.push({ label: `Same ${i + 1}`, value: 75, tip: 'Five points sharing value 75' });
  }
  return {
    years: false,
    points,
    hilites: [{ label: 'Twin clusters', ...numericRange(33, 38) }],
    presets: [
      { label: 'Twin clusters', ...numericRange(30, 40) },
      { label: 'Second half', ...numericRange(50, 100) },
      CUSTOM,
    ],
    timelineRange: numericRange(0, 100),
  };
}
