import { RouterTestingHarness } from '@angular/router/testing';

import { dateTimeToTick, GAME_START_TICK } from '@app/clock/domain/calendar-logic';
import { formatGameDate, formatGameTime } from '@app/clock/domain/game-time-format';
import { TICKS_PER_DAY, TICKS_PER_MINUTE } from '@app/clock/domain/models/time.model';
import { CandleResolution } from '@app/market/domain/models/candle.model';
import { formatNumber, formatPercent } from '@app/shared/util/format';

import { installChartPlatform } from '../../../../testing/chart-platform';
import {
  byTestId,
  click,
  queryByTestId,
  select,
  textOf,
  typeText,
  wheel,
} from '../../../../testing/dom';
import { renderRoute, settle } from '../../../../testing/page';
import { provideInProcessLabWorker } from '../../data-access/testing/in-process-lab-worker';
import { LabSimulation } from '../../domain/lab-simulation';
import { LabChartOptions } from '../../ui/series-chart/series-chart.model';
import { CandleRequest } from '../state/lab.model';
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

  function tableRows(testId: string): number {
    return byTestId(page, testId).querySelectorAll('tbody tr').length;
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

    it('lists the companies and, on their tab, the ETFs of the world', async () => {
      await generateWorld();
      const overview = oracle.overview();
      expect(tableRows('lab.simulation.companies')).toBe(overview.companies.length);
      await act(() => click(byTestId(page, 'lab.simulation.world-tabs.etfs.tab')));
      expect(tableRows('lab.simulation.etfs')).toBe(overview.etfs.length);
    });

    it('advances the game time by the simulated days', async () => {
      await generateWorld();
      await act(() => click(byTestId(page, 'lab.simulation.simulate.7')));
      expect(textOf(byTestId(page, 'lab.simulation.game-time'))).toContain(
        formatGameTime(oracle.now + 7 * TICKS_PER_DAY),
      );
    });

    it('advances the game time by ten years to the same date', async () => {
      await generateWorld();
      await act(() => click(byTestId(page, 'lab.simulation.simulate.10y')));
      expect(textOf(byTestId(page, 'lab.simulation.game-time'))).toContain(
        formatGameTime(dateTimeToTick({ year: 2040, month: 4, day: 1 }) - TICKS_PER_MINUTE),
      );
    });

    it('simulates again after leaving the page while a simulation was running', async () => {
      await generateWorld();
      click(byTestId(page, 'lab.simulation.simulate.7'));
      await harness.navigateByUrl('/lab/components');
      await harness.navigateByUrl('/lab/simulation');
      await settle(harness.fixture);
      page = harness.fixture.nativeElement;
      await generateWorld();
      await act(() => click(byTestId(page, 'lab.simulation.simulate.7')));
      expect(textOf(byTestId(page, 'lab.simulation.game-time'))).toContain(
        formatGameTime(oracle.now + 7 * TICKS_PER_DAY),
      );
    });
  });

  describe('statistics', () => {
    it('measures the period from the epoch against the calibration targets', async () => {
      await generateWorld();
      await act(() => click(byTestId(page, 'lab.simulation.statistics.compute')));
      const expected = oracle.statistics('epoch');
      const target = (id: string): string =>
        textOf(byTestId(page, `lab.simulation.statistics.target.${id}.value`));
      const value = (id: string): number =>
        expected.targets.find((row) => row.id === id)?.value ?? Number.NaN;

      expect(target('world-volatility')).toBe(
        formatPercent(value('world-volatility'), 1).replace(/\s+/g, ' '),
      );
      expect(target('correlation-within')).toBe(formatNumber(value('correlation-within'), 2));
      // About ten years of prehistory are too short for the long-run return.
      expect(textOf(byTestId(page, 'lab.simulation.statistics.target.world-return.status'))).toBe(
        'zu kurz',
      );
      expect(
        page.querySelectorAll('[data-testid="lab.simulation.statistics.phase-timeline.segment"]'),
      ).toHaveLength(expected.phases.length);
      expect(textOf(byTestId(page, 'lab.simulation.statistics.distribution.kurtosis'))).toBe(
        formatNumber(expected.distribution.kurtosis, 2),
      );
      const sector = expected.correlations.sectorIds[0];
      expect(
        textOf(byTestId(page, `lab.simulation.statistics.correlation.${sector}.${sector}`)),
      ).toBe(formatNumber(expected.correlations.values[0][0], 2));
      expect(
        page.querySelectorAll('[data-testid="lab.simulation.statistics.drawdown"]'),
      ).toHaveLength(expected.drawdowns.length);
    });

    it('drops the statistics after a simulation and computes them from the chosen start', async () => {
      await generateWorld();
      await act(() => click(byTestId(page, 'lab.simulation.statistics.compute')));
      expect(queryByTestId(page, 'lab.simulation.statistics.targets')).not.toBeNull();

      await act(() => click(byTestId(page, 'lab.simulation.simulate.30')));
      expect(queryByTestId(page, 'lab.simulation.statistics.targets')).toBeNull();

      await act(() => click(byTestId(page, 'lab.simulation.statistics.start.game-start')));
      expect(textOf(byTestId(page, 'lab.simulation.statistics.period'))).toContain(
        formatGameDate(GAME_START_TICK),
      );
      expect(queryByTestId(page, 'lab.simulation.statistics.duration')).not.toBeNull();
    });
  });

  describe('series', () => {
    it('shows the candles of the chosen series', async () => {
      await generateWorld();
      // Another share: indices would build a year from the minute curves of all constituents.
      const share = oracle.overview().series.filter((option) => option.kind === 'stock')[1];
      if (share === undefined) {
        throw new Error('The world has only one share');
      }
      await act(() =>
        select(byTestId<HTMLSelectElement>(page, 'lab.simulation.chart.series'), `${share.series}`),
      );
      expect(textOf(byTestId(page, 'lab.simulation.chart.series-name'))).toContain(share.name);
      expect(shownCandles()).toBe(
        oracleCandles(
          candleRequest(
            share.series,
            { range: '1y', resolution: '1d', chartType: 'candles' },
            oracle.now,
          ),
        ),
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
