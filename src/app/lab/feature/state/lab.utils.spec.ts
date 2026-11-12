import { dateTimeToTick, GAME_START_TICK } from '@app/clock/domain/calendar-logic';
import { TICKS_PER_DAY, TICKS_PER_MINUTE } from '@app/clock/domain/models/time.model';
import { CANDLE_RESOLUTIONS } from '@app/market/domain/models/candle.model';

import {
  candleRequest,
  DEFAULT_RESOLUTIONS,
  historyRequest,
  isSameCandleRequest,
  mergeChartOptions,
  prependCandles,
  RANGE_RESOLUTIONS,
  rangeStart,
} from './lab.utils';

import { CHART_RANGES, LabChartOptions } from '../../ui/series-chart/series-chart.model';

describe('lab utils', () => {
  describe('mergeChartOptions', () => {
    it('keeps a resolution that the range allows', () => {
      expect(
        mergeChartOptions({ range: '1y', resolution: '1d', chartType: 'line' }, { range: '3m' }),
      ).toEqual({ range: '3m', resolution: '1d', chartType: 'line' });
    });

    it('falls back to the default resolution of the range', () => {
      expect(
        mergeChartOptions({ range: '1y', resolution: '1d', chartType: 'line' }, { range: '1d' }),
      ).toEqual({ range: '1d', resolution: DEFAULT_RESOLUTIONS['1d'], chartType: 'line' });
    });

    it('returns the same options when nothing changes', () => {
      const options: LabChartOptions = { range: '1w', resolution: '1h', chartType: 'line' };
      expect(mergeChartOptions(options, { range: '1w', resolution: '1h' })).toBe(options);
    });
  });

  describe('RANGE_RESOLUTIONS', () => {
    it('lists the resolutions fine to coarse and contains the default', () => {
      for (const range of CHART_RANGES) {
        const resolutions = RANGE_RESOLUTIONS[range];
        const sorted = [...resolutions].sort(
          (a, b) => CANDLE_RESOLUTIONS.indexOf(a) - CANDLE_RESOLUTIONS.indexOf(b),
        );
        expect(resolutions).toEqual(sorted);
        expect(resolutions).toContain(DEFAULT_RESOLUTIONS[range]);
      }
    });
  });

  describe('rangeStart', () => {
    // Sunday 31.03.2030 23:59, the minute before the game start.
    const sunday = GAME_START_TICK - TICKS_PER_MINUTE;

    it('starts 1d at the last market day up to now', () => {
      expect(rangeStart('1d', sunday)).toBe(dateTimeToTick({ year: 2030, month: 3, day: 29 }));
      expect(rangeStart('1d', GAME_START_TICK + 600)).toBe(GAME_START_TICK);
    });

    it('counts other ranges back in calendar days and starts max at the epoch', () => {
      expect(rangeStart('1w', sunday)).toBe(sunday - 7 * TICKS_PER_DAY);
      expect(rangeStart('1y', sunday)).toBe(sunday - 365 * TICKS_PER_DAY);
      expect(rangeStart('max', sunday)).toBe(0);
      expect(rangeStart('1y', 10)).toBe(0);
    });
  });

  describe('candleRequest', () => {
    it('requests the range up to now', () => {
      expect(
        candleRequest(4, { range: '1w', resolution: '1h', chartType: 'candles' }, GAME_START_TICK),
      ).toEqual({
        series: 4,
        resolution: '1h',
        fromTick: GAME_START_TICK - 7 * TICKS_PER_DAY,
        toTick: GAME_START_TICK,
        source: 'minutes',
      });
    });

    it('uses the support points since the epoch', () => {
      expect(
        candleRequest(4, { range: 'max', resolution: '1w', chartType: 'candles' }, GAME_START_TICK)
          .source,
      ).toBe('support');
    });
  });

  describe('historyRequest', () => {
    const options = { range: '1w', resolution: '15m', chartType: 'candles' } as const;

    it('requests the block of the range before the loaded period', () => {
      expect(historyRequest(3, options, GAME_START_TICK)).toEqual({
        series: 3,
        resolution: '15m',
        fromTick: GAME_START_TICK - 1 - 7 * TICKS_PER_DAY,
        toTick: GAME_START_TICK - 1,
        source: 'minutes',
      });
    });

    it('stops at the epoch', () => {
      expect(historyRequest(3, options, TICKS_PER_DAY)?.fromTick).toBe(0);
      expect(historyRequest(3, options, 0)).toBeNull();
    });
  });

  describe('isSameCandleRequest', () => {
    const request = candleRequest(
      1,
      { range: '1y', resolution: '1d', chartType: 'line' },
      GAME_START_TICK,
    );

    it('compares all fields', () => {
      expect(isSameCandleRequest(request, { ...request })).toBe(true);
      expect(isSameCandleRequest(request, { ...request, series: 2 })).toBe(false);
      expect(isSameCandleRequest(request, null)).toBe(false);
    });
  });

  describe('prependCandles', () => {
    const candle = (tick: number) => ({ tick, open: tick, high: tick, low: tick, close: tick });

    it('puts older candles in front and drops the ones already loaded', () => {
      expect(prependCandles([candle(1), candle(2), candle(3)], [candle(3), candle(4)])).toEqual([
        candle(1),
        candle(2),
        candle(3),
        candle(4),
      ]);
      expect(prependCandles([candle(1)], [])).toEqual([candle(1)]);
    });
  });
});
