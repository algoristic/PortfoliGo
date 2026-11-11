import { RouterTestingHarness } from '@angular/router/testing';

import { installChartPlatform } from '../../../../testing/chart-platform';
import { byTestId, click, queryByTestId, textOf, typeText, wheel } from '../../../../testing/dom';
import { renderRoute, settle } from '../../../../testing/page';
import { formatGameTime } from '../../../clock/domain/game-time-format';
import { TICKS_PER_DAY } from '../../../clock/domain/models/time.model';
import { CandleResolution } from '../../../market/domain/models/candle.model';
import { provideInProcessLabWorker } from '../../data-access/testing/in-process-lab-worker';
import { LabSimulation } from '../../domain/lab-simulation';
import { CandleRequest, LabChartOptions } from '../state/lab.model';
import { candleRequest, historyRequest, prependCandles } from '../state/lab.utils';

const SEED = 'page-test';

describe('SimulationPage', () => {
  let oracle: LabSimulation;
  let harness: RouterTestingHarness;
  let page: HTMLElement;
  let restorePlatform: () => void;

  beforeAll(() => {
    // The same world outside the page: it tells how many candles a range has.
    oracle = new LabSimulation(SEED);
    oracle.runPrehistory();
  });

  beforeEach(async () => {
    restorePlatform = installChartPlatform();
    harness = await renderRoute('/lab/simulation', [provideInProcessLabWorker()]);
    page = harness.fixture.nativeElement;
  });

  afterEach(() => restorePlatform());

  async function act(action: () => void): Promise<void> {
    action();
    await settle(harness.fixture);
  }

  async function generateWorld(): Promise<void> {
    typeText(byTestId<HTMLInputElement>(page, 'lab.simulation.seed'), SEED);
    await act(() => click(byTestId(page, 'lab.simulation.generate')));
  }

  function shownCandles(): number {
    return Number.parseInt(textOf(byTestId(page, 'lab.simulation.chart.candle-count')), 10);
  }

  function chartCanvas(): HTMLCanvasElement {
    const canvas = byTestId(page, 'lab.simulation.chart').querySelector('canvas');
    if (canvas === null) {
      throw new Error('The chart has no canvas');
    }
    return canvas;
  }

  function oracleCandles(request: CandleRequest | null): number {
    if (request === null) {
      throw new Error('No candle request');
    }
    const { series, resolution, fromTick, toTick, source } = request;
    return oracle.candles(series, resolution, fromTick, toTick, source).length;
  }

  function weekOptions(resolution: CandleResolution): LabChartOptions {
    return { range: '1w', resolution, chartType: 'candles' };
  }

  describe('world', () => {
    it('generates the world of the seed and shows its game time and chart', async () => {
      expect(queryByTestId(page, 'lab.simulation.game-time')).toBeNull();
      await generateWorld();
      expect(textOf(page)).toContain(`Aktueller Seed: ${SEED}`);
      expect(textOf(byTestId(page, 'lab.simulation.game-time'))).toContain(
        formatGameTime(oracle.now),
      );
      expect(shownCandles()).toBe(
        oracleCandles(
          candleRequest(0, { range: '1y', resolution: '1d', chartType: 'candles' }, oracle.now),
        ),
      );
    });

    it('asks for a seed instead of generating without one', async () => {
      await act(() => click(byTestId(page, 'lab.simulation.generate')));
      expect(textOf(byTestId(page, 'lab.simulation.seed-error'))).toBe('Bitte gib einen Seed ein.');
      expect(queryByTestId(page, 'lab.simulation.game-time')).toBeNull();
    });

    it('advances the game time by the simulated days', async () => {
      await generateWorld();
      await act(() => click(byTestId(page, 'lab.simulation.simulate.7')));
      expect(textOf(byTestId(page, 'lab.simulation.game-time'))).toContain(
        formatGameTime(oracle.now + 7 * TICKS_PER_DAY),
      );
    });
  });

  describe('chart', () => {
    beforeEach(async () => {
      await generateWorld();
      await act(() => click(byTestId(page, 'lab.simulation.chart.range.1w')));
      await act(() => click(byTestId(page, 'lab.simulation.chart.resolution.15m')));
    });

    // Regression (8a7457a): every new data set loaded one or more older blocks right away.
    it('shows exactly the candles of the range when switching resolutions', async () => {
      const quarterHours = oracleCandles(candleRequest(0, weekOptions('15m'), oracle.now));
      const hours = oracleCandles(candleRequest(0, weekOptions('1h'), oracle.now));
      expect(shownCandles()).toBe(quarterHours);
      for (let round = 0; round < 2; round++) {
        await act(() => click(byTestId(page, 'lab.simulation.chart.resolution.1h')));
        expect(shownCandles()).toBe(hours);
        await act(() => click(byTestId(page, 'lab.simulation.chart.resolution.15m')));
        expect(shownCandles()).toBe(quarterHours);
      }
    });

    it('loads one older block when the user zooms out at the oldest candle', async () => {
      const request = candleRequest(0, weekOptions('15m'), oracle.now);
      const block = historyRequest(0, weekOptions('15m'), request.fromTick);
      const { series, resolution, fromTick, toTick, source } = request;
      const current = oracle.candles(series, resolution, fromTick, toTick, source);
      const older =
        block === null
          ? []
          : oracle.candles(series, resolution, block.fromTick, block.toTick, block.source);
      expect(shownCandles()).toBe(current.length);

      await act(() => wheel(chartCanvas(), 100));

      expect(shownCandles()).toBe(prependCandles(older, current).length);
      expect(queryByTestId(page, 'lab.simulation.chart.loading-history')).toBeNull();
    });
  });
});
