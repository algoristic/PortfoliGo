import { Instrument } from '@app/market/domain/models/instrument.model';

import {
  selectInstrumentQuote,
  selectInstrumentsByKind,
  selectInstrumentsBySeries,
  selectOverviewIndexSeries,
  selectRouteInstrument,
} from './market.selectors';

const STOCK = { id: 'cmp-0001', series: 0, kind: 'stock' } as Instrument;
const WORLD = {
  id: 'idx-world',
  series: 1,
  kind: 'index',
  variant: 'price',
  indexKind: 'world',
} as Instrument;
const SECTOR = {
  id: 'idx-tech',
  series: 2,
  kind: 'index',
  variant: 'price',
  indexKind: 'sector',
} as Instrument;
const WORLD_TR = {
  id: 'idx-world-tr',
  series: 3,
  kind: 'index',
  variant: 'total-return',
  indexKind: 'world',
} as Instrument;
const ETF = { id: 'etf-0001', series: 4, kind: 'etf' } as Instrument;
const ALL = [STOCK, WORLD, SECTOR, WORLD_TR, ETF];

describe('market selectors', () => {
  describe('selectOverviewIndexSeries', () => {
    it('takes the price indices without the sector indices', () => {
      expect(selectOverviewIndexSeries.projector(ALL)).toEqual([1]);
    });
  });

  describe('selectInstrumentsByKind', () => {
    it('groups the instruments by kind in series order', () => {
      expect(selectInstrumentsByKind.projector(ALL)).toEqual({
        stock: [STOCK],
        index: [WORLD, SECTOR, WORLD_TR],
        etf: [ETF],
      });
    });
  });

  describe('selectInstrumentsBySeries', () => {
    it('finds an instrument by its series', () => {
      expect(selectInstrumentsBySeries.projector(ALL).get(4)).toBe(ETF);
    });
  });

  describe('selectInstrumentQuote', () => {
    const quote = {
      series: 0,
      last: 10,
      bid: 9.99,
      ask: 10.01,
      previousClose: 10,
      change: 0,
      changeRatio: 0,
    };

    it('joins the instrument with the quote of its series', () => {
      expect(selectInstrumentQuote(STOCK.id).projector(STOCK, { 0: quote })).toEqual({
        instrument: STOCK,
        quote,
      });
    });

    it('has no quote before the first one arrived and nothing for an unknown instrument', () => {
      expect(selectInstrumentQuote(STOCK.id).projector(STOCK, {})).toEqual({
        instrument: STOCK,
        quote: null,
      });
      expect(selectInstrumentQuote('x').projector(null, { 0: quote })).toBeNull();
    });
  });

  describe('selectRouteInstrument', () => {
    it('is null without a parameter or for an unknown ID', () => {
      const entities = { [STOCK.id]: STOCK };
      expect(selectRouteInstrument.projector(STOCK.id, entities)).toBe(STOCK);
      expect(selectRouteInstrument.projector(undefined, entities)).toBeNull();
      expect(selectRouteInstrument.projector('cmp-9999', entities)).toBeNull();
    });
  });
});
