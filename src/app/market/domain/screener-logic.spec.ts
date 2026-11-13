import fc from 'fast-check';

import {
  REGION_IDS,
  SECTOR_IDS,
  SIZE_CLASSES,
  STYLES,
} from '@app/world/domain/models/taxonomy.model';

import { Instrument, INSTRUMENT_KINDS, StockInstrument } from './models/instrument.model';
import {
  SCREENER_SORT_KEYS,
  ScreenerCriteria,
  ScreenerMetrics,
  ScreenerSortKey,
} from './models/screener.model';
import {
  matchesInstrument,
  matchesMetrics,
  matchesSearch,
  sortScreenerEntries,
} from './screener-logic';

function stock(fields: Partial<StockInstrument> = {}): StockInstrument {
  return {
    kind: 'stock',
    id: 'cmp-001',
    series: 0,
    name: 'Nordwerk AG',
    ticker: 'NWK',
    isin: 'DE000NWK0019',
    exchangeId: 'exc-de',
    regionId: 'europe',
    countryId: 'DE',
    sectorId: 'industrials',
    industryId: 'machinery',
    size: 'large',
    style: 'value',
    riskClass: 3,
    savingsPlanEligible: true,
    ...fields,
  };
}

function metrics(fields: Partial<ScreenerMetrics> = {}): ScreenerMetrics {
  return {
    changeRatio: 0,
    performance: { m1: 0, m6: 0, y1: 0, y5: 0 },
    dividendYield: 0,
    ...fields,
  };
}

describe('matchesSearch', () => {
  const instrument = stock();

  it.each([
    ['an empty text', '', true],
    ['blanks only', '   ', true],
    ['a part of the name, other case', 'nordW', true],
    ['the ticker in lower case', 'nwk', true],
    ['a part of the ISIN', '000nwk', true],
    ['surrounding blanks', '  Werk ', true],
    ['another word', 'Südwerk', false],
  ])('treats %s', (_label, search, expected) => {
    expect(matchesSearch(instrument, search)).toBe(expected);
  });

  it('skips the missing ISIN of an index', () => {
    const index: Instrument = {
      ...stock({ name: 'Global 100', ticker: 'G100', isin: null }),
      kind: 'index',
      variant: 'price',
      indexKind: 'world',
      indexId: 'idx-001',
      constituentCount: 100,
    };
    expect(matchesSearch(index, 'null')).toBe(false);
    expect(matchesSearch(index, 'g10')).toBe(true);
  });
});

describe('matchesInstrument', () => {
  it.each<[string, ScreenerCriteria, boolean]>([
    ['no criteria', {}, true],
    ['empty lists', { regions: [], sectors: [] }, true],
    ['one of two regions', { regions: ['north-america', 'europe'] }, true],
    ['another region', { regions: ['asia-pacific'] }, false],
    ['region and sector', { regions: ['europe'], sectors: ['industrials'] }, true],
    ['region but another sector', { regions: ['europe'], sectors: ['energy'] }, false],
    ['the asset class', { assetClasses: ['stock'] }, true],
    ['another asset class', { assetClasses: ['etf', 'index'] }, false],
    [
      'country, industry, size and style',
      {
        countries: ['DE'],
        industries: ['machinery'],
        sizes: ['large'],
        styles: ['value'],
      },
      true,
    ],
    ['another style', { styles: ['growth'] }, false],
    ['search and filter', { search: 'nord', countries: ['FR'] }, false],
  ])('matches %s', (_label, criteria, expected) => {
    expect(matchesInstrument(stock(), criteria)).toBe(expected);
  });

  it('never matches a missing attribute with a set filter', () => {
    const etf = stock({ countryId: null, size: null, style: null, sectorId: null });
    expect(matchesInstrument(etf, { countries: ['DE'] })).toBe(false);
    expect(matchesInstrument(etf, { sizes: ['large'] })).toBe(false);
    expect(matchesInstrument(etf, { sectors: ['industrials'] })).toBe(false);
    expect(matchesInstrument(etf, { regions: ['europe'] })).toBe(true);
  });

  const instrumentArb = fc.record({
    kind: fc.constantFrom(...INSTRUMENT_KINDS),
    regionId: fc.option(fc.constantFrom(...REGION_IDS)),
    countryId: fc.option(fc.constantFrom('DE', 'US', 'JP')),
    sectorId: fc.option(fc.constantFrom(...SECTOR_IDS)),
    industryId: fc.option(fc.constantFrom('software', 'banks')),
    size: fc.option(fc.constantFrom(...SIZE_CLASSES)),
    style: fc.option(fc.constantFrom(...STYLES)),
  });
  const criteriaArb = fc.record(
    {
      assetClasses: fc.subarray([...INSTRUMENT_KINDS]),
      regions: fc.subarray([...REGION_IDS]),
      countries: fc.subarray(['DE', 'US', 'JP']),
      sectors: fc.subarray([...SECTOR_IDS]),
      industries: fc.subarray(['software', 'banks']),
      sizes: fc.subarray([...SIZE_CLASSES]),
      styles: fc.subarray([...STYLES]),
    },
    { requiredKeys: [] },
  );

  it('is the intersection of the single filters, each the union of its values', () => {
    fc.assert(
      fc.property(instrumentArb, criteriaArb, (fields, criteria) => {
        // Every kind carries the fields the filters look at; the kind itself is just a code here.
        const instrument = { ...stock(), ...fields } as Instrument;
        const singles = Object.entries(criteria).map(([dimension, values]) =>
          (values as string[]).length === 0
            ? true
            : (values as string[]).some((value) =>
                matchesInstrument(instrument, { [dimension]: [value] }),
              ),
        );
        expect(matchesInstrument(instrument, criteria)).toBe(singles.every(Boolean));
      }),
    );
  });
});

describe('matchesMetrics', () => {
  it.each<[string, number | null, ScreenerCriteria['dividendYield'], boolean]>([
    ['no range', null, undefined, true],
    ['an empty range', null, {}, true],
    ['the lower bound', 0.02, { min: 0.02 }, true],
    ['below the lower bound', 0.0199, { min: 0.02 }, false],
    ['the upper bound', 0.05, { max: 0.05 }, true],
    ['above the upper bound', 0.0501, { min: 0.01, max: 0.05 }, false],
    ['no yield with a range', null, { min: 0 }, false],
    ['zero with an upper bound', 0, { max: 0.01 }, true],
  ])('treats %s', (_label, dividendYield, range, expected) => {
    expect(matchesMetrics(metrics({ dividendYield }), { dividendYield: range })).toBe(expected);
  });
});

describe('sortScreenerEntries', () => {
  function entry(series: number, name: string, fields: Partial<ScreenerMetrics> = {}) {
    return { instrument: stock({ series, name, id: `s${series}` }), metrics: metrics(fields) };
  }

  it('sorts names with the German collation, ignoring case', () => {
    const entries = [entry(0, 'Zeta'), entry(1, 'Ölwerk'), entry(2, 'alpha'), entry(3, 'Omega')];
    const sorted = sortScreenerEntries(entries).map(({ instrument }) => instrument.name);
    expect(sorted).toEqual(['alpha', 'Ölwerk', 'Omega', 'Zeta']);
    const descending = sortScreenerEntries(entries, { key: 'name', direction: 'desc' });
    expect(descending.map(({ instrument }) => instrument.name)).toEqual([
      'Zeta',
      'Omega',
      'Ölwerk',
      'alpha',
    ]);
  });

  it('puts missing values last in both directions and keeps the series order on ties', () => {
    const entries = [
      entry(0, 'A', { dividendYield: null }),
      entry(1, 'B', { dividendYield: 0.02 }),
      entry(2, 'C', { dividendYield: 0.01 }),
      entry(3, 'D', { dividendYield: null }),
      entry(4, 'E', { dividendYield: 0.02 }),
    ];
    const series = (key: 'asc' | 'desc'): number[] =>
      sortScreenerEntries(entries, { key: 'dividendYield', direction: key }).map(
        ({ instrument }) => instrument.series,
      );
    expect(series('asc')).toEqual([2, 1, 4, 0, 3]);
    expect(series('desc')).toEqual([1, 4, 2, 0, 3]);
  });

  function valueOf(m: ScreenerMetrics, key: Exclude<ScreenerSortKey, 'name'>): number | null {
    if (key === 'changeRatio') {
      return m.changeRatio;
    }
    return key === 'dividendYield' ? m.dividendYield : m.performance[key];
  }

  const valueArb = fc.option(fc.double({ min: -1, max: 5, noNaN: true }), { freq: 4 });
  const entriesArb = fc.array(
    fc.record({
      changeRatio: fc.double({ min: -0.5, max: 0.5, noNaN: true }),
      m1: valueArb,
      m6: valueArb,
      y1: valueArb,
      y5: valueArb,
      dividendYield: valueArb,
    }),
    { maxLength: 40 },
  );
  const metricKeys = SCREENER_SORT_KEYS.filter(
    (key): key is Exclude<ScreenerSortKey, 'name'> => key !== 'name',
  );

  it('returns a permutation, monotone in the metric with missing values last', () => {
    fc.assert(
      fc.property(
        entriesArb,
        fc.constantFrom(...metricKeys),
        fc.constantFrom('asc' as const, 'desc' as const),
        (rows, key, direction) => {
          const entries = rows.map(({ changeRatio, m1, m6, y1, y5, dividendYield }, series) =>
            entry(series, `N${series}`, {
              changeRatio,
              performance: { m1, m6, y1, y5 },
              dividendYield,
            }),
          );
          const sorted = sortScreenerEntries(entries, { key, direction });
          expect(sorted.map(({ instrument }) => instrument.series).sort((a, b) => a - b)).toEqual(
            entries.map((_e, i) => i),
          );
          const values = sorted.map(({ metrics: m }) => valueOf(m, key));
          const firstMissing = values.indexOf(null);
          if (firstMissing >= 0) {
            expect(values.slice(firstMissing).every((value) => value === null)).toBe(true);
          }
          const present = values.filter((value): value is number => value !== null);
          for (let i = 1; i < present.length; i++) {
            if (direction === 'asc') {
              expect(present[i]).toBeGreaterThanOrEqual(present[i - 1]);
            } else {
              expect(present[i]).toBeLessThanOrEqual(present[i - 1]);
            }
          }
        },
      ),
    );
  });
});
