import { candleRequest, mergeChartOptions, RANGE_RESOLUTIONS, rangeStart } from './lab.utils';

import { dateTimeToTick, GAME_START_TICK } from '../../../clock/domain/calendar-logic';
import { TICKS_PER_DAY, TICKS_PER_MINUTE } from '../../../clock/domain/models/time.model';

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
      ).toEqual({ range: '1d', resolution: RANGE_RESOLUTIONS['1d'][0], chartType: 'line' });
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
});
