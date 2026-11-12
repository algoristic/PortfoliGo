import { GAME_START_TICK } from '@app/clock/domain/calendar-logic';

import { TICKS_PER_DAY } from '@app/clock/domain/models/time.model';

import { initialLabState, LabState } from './lab.reducer';
import * as LabSelectors from './lab.selectors';

import { SeriesOption } from '../../domain/models/world-overview.model';
import { LabChartOptions } from '../../ui/series-chart/series-chart.model';

describe('LabSelectors', () => {
  const options: LabChartOptions = { range: '1w', resolution: '1h', chartType: 'line' };

  describe('selectBusy', () => {
    it('is true while generating or simulating', () => {
      expect(LabSelectors.selectBusy.projector('generating')).toBe(true);
      expect(LabSelectors.selectBusy.projector('simulating')).toBe(true);
      expect(LabSelectors.selectBusy.projector('ready')).toBe(false);
      expect(LabSelectors.selectBusy.projector('idle')).toBe(false);
    });
  });

  describe('selectSeriesOptions', () => {
    it('is empty without a world', () => {
      expect(LabSelectors.selectSeriesOptions.projector(undefined)).toEqual([]);
    });
  });

  describe('selectSelectedSeriesOption', () => {
    it('picks the option of the selected series', () => {
      const series: SeriesOption[] = [
        { series: 0, id: 'a', kind: 'stock', name: 'A', ticker: 'A' },
        { series: 1, id: 'b', kind: 'index', name: 'B', ticker: 'B' },
      ];
      expect(LabSelectors.selectSelectedSeriesOption.projector(series, 1)).toBe(series[1]);
    });
  });

  describe('selectAllowedResolutions', () => {
    it('gives the resolutions of the range', () => {
      expect(LabSelectors.selectAllowedResolutions.projector(options)).toEqual([
        '5m',
        '15m',
        '1h',
        '1d',
      ]);
    });
  });

  describe('selectCandleRequest', () => {
    it('is null without a world', () => {
      expect(LabSelectors.selectCandleRequest.projector(0, options, undefined)).toBeNull();
    });

    it('requests the selected series over the range', () => {
      expect(LabSelectors.selectCandleRequest.projector(2, options, GAME_START_TICK)).toEqual({
        series: 2,
        resolution: '1h',
        fromTick: GAME_START_TICK - 7 * TICKS_PER_DAY,
        toTick: GAME_START_TICK,
        source: 'minutes',
      });
    });
  });

  describe('selectHistoryRequest', () => {
    const state: LabState = {
      ...initialLabState,
      selectedSeries: 2,
      chartOptions: { range: '3m', resolution: '1d', chartType: 'candles' },
      candles: [{ tick: GAME_START_TICK, open: 1, high: 1, low: 1, close: 1 }],
      historyFrom: GAME_START_TICK,
    };

    it('is null while no history block loads', () => {
      expect(LabSelectors.selectHistoryRequest.projector(state)).toBeNull();
    });

    it('requests the block before the loaded period while it loads', () => {
      expect(
        LabSelectors.selectHistoryRequest.projector({ ...state, loadingHistory: true }),
      ).toEqual({
        series: 2,
        resolution: '1d',
        fromTick: GAME_START_TICK - 1 - 91 * TICKS_PER_DAY,
        toTick: GAME_START_TICK - 1,
        source: 'minutes',
      });
    });
  });
});
