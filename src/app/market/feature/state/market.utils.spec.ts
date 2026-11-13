import { SeriesQuote } from '@app/engine/domain/models/series-quote.model';

import { latestQuotes, normalizeSeries, subscribedSeries } from './market.utils';

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
});
