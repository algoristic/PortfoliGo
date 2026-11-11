import { LabChartOptions } from './lab.model';
import * as LabSelectors from './lab.selectors';

import { GAME_START_TICK } from '../../../clock/domain/calendar-logic';
import { TICKS_PER_DAY } from '../../../clock/domain/models/time.model';
import { SeriesOption } from '../../domain/models/world-overview.model';

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
        '15m',
        '5m',
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
});
