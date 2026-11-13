import { SeriesQuote } from '@app/engine/domain/models/series-quote.model';

import { ChartIndicator } from '@app/market/ui/models/chart-indicator.model';

import {
  DEFAULT_CHART_SETTINGS,
  latestQuotes,
  nextIndicatorColor,
  nextIndicatorId,
  normalizeSeries,
  parseChartSettings,
  subscribedSeries,
  withChartIndicator,
} from './market.utils';

const SMA: ChartIndicator = { id: 'i1', spec: { kind: 'sma', period: 20 }, color: 'chart-1' };
const BOLLINGER: ChartIndicator = {
  id: 'i3',
  spec: { kind: 'bollinger', period: 20, multiplier: 2 },
  color: 'chart-2',
};

function quote(series: number, last: number): SeriesQuote {
  return { series, last, bid: null, ask: null, previousClose: 1, change: 0, changeRatio: 0 };
}

describe('market utils', () => {
  describe('normalizeSeries', () => {
    it('sorts numerically and removes duplicates', () => {
      expect(normalizeSeries([10, 2, 10, 1])).toEqual([1, 2, 10]);
    });
  });

  describe('subscribedSeries', () => {
    it('unites the series of all keys', () => {
      expect([...subscribedSeries({ a: [1, 2], b: [2, 3] })].sort()).toEqual([1, 2, 3]);
    });
  });

  describe('latestQuotes', () => {
    it('keeps the newest quote per series in the order of first arrival', () => {
      expect(latestQuotes([[quote(2, 1), quote(1, 1)], [quote(3, 1)], [quote(2, 5)]])).toEqual([
        quote(2, 5),
        quote(1, 1),
        quote(3, 1),
      ]);
    });
  });

  describe('parseChartSettings', () => {
    it('keeps valid settings', () => {
      const stored = { range: '1y', chartType: 'line', indicators: [SMA, BOLLINGER] };
      expect(parseChartSettings(stored)).toEqual(stored);
    });

    it.each([undefined, null, 'x', 3, [], [SMA]])('gives the defaults for %o', (data) => {
      expect(parseChartSettings(data)).toEqual(DEFAULT_CHART_SETTINGS);
    });

    it('replaces each invalid field on its own', () => {
      expect(parseChartSettings({ range: '2y', chartType: 'line', indicators: 'sma' })).toEqual({
        range: '1d',
        chartType: 'line',
        indicators: [],
      });
      expect(parseChartSettings({ range: '5y', chartType: 'bars' })).toEqual({
        range: '5y',
        chartType: 'candles',
        indicators: [],
      });
    });

    it('drops invalid indicators and repeated ids and keeps at most six', () => {
      const invalid = [
        { ...SMA, id: 'x1' },
        { ...SMA, id: 'i0' },
        { ...SMA, id: 7 },
        { ...SMA, id: 'i9', spec: { kind: 'sma', period: 1 } },
        { ...SMA, id: 'i9', spec: { kind: 'bollinger', period: 20 } },
        { ...SMA, id: 'i9', color: 'red' },
        { ...SMA, id: 'i9', color: undefined },
        null,
        'i9',
        { ...SMA, color: 'chart-3' },
      ];
      expect(parseChartSettings({ indicators: [SMA, ...invalid, BOLLINGER] }).indicators).toEqual([
        SMA,
        BOLLINGER,
      ]);
      const many = Array.from({ length: 8 }, (_, index) => ({ ...SMA, id: `i${index + 1}` }));
      expect(parseChartSettings({ indicators: many }).indicators.map(({ id }) => id)).toEqual([
        'i1',
        'i2',
        'i3',
        'i4',
        'i5',
        'i6',
      ]);
    });

    it('drops unknown fields of an indicator', () => {
      const stored = { ...SMA, extra: 1, spec: { ...SMA.spec } };
      expect(parseChartSettings({ indicators: [stored] }).indicators).toEqual([SMA]);
    });
  });

  describe('nextIndicatorId and nextIndicatorColor', () => {
    it('counts on from the highest id and takes the first free colour', () => {
      expect(nextIndicatorId([])).toBe('i1');
      expect(nextIndicatorId([BOLLINGER, SMA])).toBe('i4');
      expect(nextIndicatorColor([])).toBe('chart-1');
      expect(nextIndicatorColor([BOLLINGER])).toBe('chart-1');
      expect(nextIndicatorColor([SMA, BOLLINGER])).toBe('chart-3');
    });

    it('repeats the colours in order when all are taken', () => {
      const colors = ['chart-1', 'chart-2', 'chart-3', 'chart-4', 'chart-5', 'chart-6'] as const;
      const all = colors.map((color, index) => ({ ...SMA, id: `i${index + 1}`, color }));
      expect(nextIndicatorColor(all)).toBe('chart-1');
      expect(nextIndicatorColor([...all, { ...SMA, id: 'i7' }])).toBe('chart-2');
    });
  });

  describe('withChartIndicator', () => {
    it('adds an indicator with the next id and colour', () => {
      expect(withChartIndicator([SMA], null, { kind: 'ema', period: 9 })).toEqual([
        SMA,
        { id: 'i2', spec: { kind: 'ema', period: 9 }, color: 'chart-2' },
      ]);
    });

    it('changes the parameters of an indicator and keeps its id and colour', () => {
      const spec = { kind: 'bollinger' as const, period: 30, multiplier: 2.5 };
      expect(withChartIndicator([SMA, BOLLINGER], 'i3', spec)).toEqual([
        SMA,
        { ...BOLLINGER, spec },
      ]);
    });

    it('adds no seventh indicator', () => {
      const six = Array.from({ length: 6 }, (_, index) => ({ ...SMA, id: `i${index + 1}` }));
      expect(withChartIndicator(six, null, SMA.spec)).toBe(six);
    });
  });
});
