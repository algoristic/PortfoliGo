import { GAME_START_TICK } from '@app/clock/domain/calendar-logic';

import { TICKS_PER_DAY } from '@app/clock/domain/models/time.model';

import { initialLabState, LabState } from './lab.reducer';
import * as LabSelectors from './lab.selectors';

describe('LabSelectors', () => {
  describe('selectBusy', () => {
    it('is true while generating, simulating or comparing seeds', () => {
      expect(LabSelectors.selectBusy.projector('generating', false)).toBe(true);
      expect(LabSelectors.selectBusy.projector('simulating', false)).toBe(true);
      expect(LabSelectors.selectBusy.projector('ready', false)).toBe(false);
      expect(LabSelectors.selectBusy.projector('idle', false)).toBe(false);
      expect(LabSelectors.selectBusy.projector('ready', true)).toBe(true);
      expect(LabSelectors.selectBusy.projector('idle', true)).toBe(true);
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
