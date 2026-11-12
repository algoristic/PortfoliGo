import { RouterTestingHarness } from '@angular/router/testing';

import { Tick, TICKS_PER_DAY } from '@app/clock/domain/models/time.model';
import { GOLDEN_CHECKSUM_IDS, GOLDEN_CHECKSUMS } from '@app/market/domain/golden-master';
import { CandleResolution } from '@app/market/domain/models/candle.model';

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
import { parseGermanNumber } from '../../../../testing/parse';
import { TEST_SEEDS } from '../../../../testing/seeds';
import { provideInProcessLabWorker } from '../../data-access/testing/in-process-lab-worker';
import { LabSimulation } from '../../domain/lab-simulation';

const SEED = TEST_SEEDS.page;

/** Lab chart ranges in calendar days back from now (TS §11.7); a history block has the same length. */
const YEAR_DAYS = 365;
const WEEK_DAYS = 7;

describe('SimulationPage', () => {
  /** The same world outside the page: it tells which candles and statistics a period has. */
  let oracle: LabSimulation;
  let harness: RouterTestingHarness;
  let page: HTMLElement;
  let restorePlatform: () => void;

  beforeAll(() => {
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

  function gameTime(): string {
    return textOf(byTestId(page, 'lab.simulation.game-time'));
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

  /** Minute-based candles of a series over the last `days` calendar days up to `toTick`. */
  function oracleCandles(series: number, resolution: CandleResolution, days: number, toTick: Tick) {
    return oracle.candles(series, resolution, toTick - days * TICKS_PER_DAY, toTick, 'minutes');
  }

  function tableRows(testId: string): number {
    return byTestId(page, testId).querySelectorAll('tbody tr').length;
  }

  /** Checks a shown number against the oracle at the precision it is shown with. */
  function expectShown(testId: string, expected: number, decimals: number, percent = false): void {
    const shown = parseGermanNumber(textOf(byTestId(page, testId)));
    const halfStep = 0.5 * Math.pow(10, -(decimals + (percent ? 2 : 0)));
    expect(Math.abs(shown - expected), testId).toBeLessThanOrEqual(halfStep + 1e-12);
  }

  describe('world', () => {
    it('asks for a seed instead of generating without one', async () => {
      await act(() => click(byTestId(page, 'lab.simulation.generate')));
      expect(textOf(byTestId(page, 'lab.simulation.seed-error'))).toBe('Bitte gib einen Seed ein.');
      expect(queryByTestId(page, 'lab.simulation.game-time')).toBeNull();
    });

    it('generates the world of the seed and shows its time, chart, tables and series', async () => {
      expect(queryByTestId(page, 'lab.simulation.game-time')).toBeNull();
      await generateWorld();

      expect(textOf(page)).toContain(`Aktueller Seed: ${SEED}`);
      // The prehistory ends the minute before the game start on Monday, 01.04.2030 (TS §3.1).
      expect(gameTime()).toContain('So., 31.03.2030, 23:59');
      expect(shownCandles()).toBe(oracleCandles(0, '1d', YEAR_DAYS, oracle.now).length);

      const overview = oracle.overview();
      expect(tableRows('lab.simulation.companies')).toBe(overview.companies.length);
      await act(() => click(byTestId(page, 'lab.simulation.world-tabs.etfs.tab')));
      expect(tableRows('lab.simulation.etfs')).toBe(overview.etfs.length);

      // Another share: indices would build a year from the minute curves of all constituents.
      const share = overview.series.filter((option) => option.kind === 'stock')[1];
      await act(() =>
        select(byTestId<HTMLSelectElement>(page, 'lab.simulation.chart.series'), `${share.series}`),
      );
      expect(textOf(byTestId(page, 'lab.simulation.chart.series-name'))).toContain(share.name);
      expect(shownCandles()).toBe(oracleCandles(share.series, '1d', YEAR_DAYS, oracle.now).length);
    });

    it('simulates days and years, also after leaving the page during a simulation', async () => {
      await generateWorld();
      click(byTestId(page, 'lab.simulation.simulate.7'));
      await harness.navigateByUrl('/lab/components');
      await harness.navigateByUrl('/lab/simulation');
      await settle(harness.fixture);
      page = harness.fixture.nativeElement;

      await generateWorld();
      await act(() => click(byTestId(page, 'lab.simulation.simulate.7')));
      expect(gameTime()).toContain('So., 07.04.2030, 23:59');
      // Ten years later on the same calendar date, a Saturday.
      await act(() => click(byTestId(page, 'lab.simulation.simulate.10y')));
      expect(gameTime()).toContain('Sa., 07.04.2040, 23:59');
    });
  });

  describe('statistics', () => {
    it('measures the period from the epoch, drops it after a simulation and measures from the game start', async () => {
      await generateWorld();
      await act(() => click(byTestId(page, 'lab.simulation.statistics.compute')));
      const expected = oracle.statistics('epoch');
      const target = (id: string): number =>
        expected.targets.find((row) => row.id === id)?.value ?? Number.NaN;

      expectShown(
        'lab.simulation.statistics.target.world-volatility.value',
        target('world-volatility'),
        1,
        true,
      );
      expectShown(
        'lab.simulation.statistics.target.correlation-within.value',
        target('correlation-within'),
        2,
      );
      // About ten years of prehistory are too short for the long-run return.
      expect(textOf(byTestId(page, 'lab.simulation.statistics.target.world-return.status'))).toBe(
        'zu kurz',
      );
      expect(
        page.querySelectorAll('[data-testid="lab.simulation.statistics.phase-timeline.segment"]'),
      ).toHaveLength(expected.phases.length);
      expectShown(
        'lab.simulation.statistics.distribution.kurtosis',
        expected.distribution.kurtosis,
        2,
      );
      const sector = expected.correlations.sectorIds[0];
      expectShown(
        `lab.simulation.statistics.correlation.${sector}.${sector}`,
        expected.correlations.values[0][0],
        2,
      );
      expect(
        page.querySelectorAll('[data-testid="lab.simulation.statistics.drawdown"]'),
      ).toHaveLength(expected.drawdowns.length);

      await act(() => click(byTestId(page, 'lab.simulation.simulate.7')));
      expect(queryByTestId(page, 'lab.simulation.statistics.targets')).toBeNull();

      await act(() => click(byTestId(page, 'lab.simulation.statistics.start.game-start')));
      expect(textOf(byTestId(page, 'lab.simulation.statistics.period'))).toContain('01.04.2030');
      expect(queryByTestId(page, 'lab.simulation.statistics.duration')).not.toBeNull();
    });
  });

  describe('chart', () => {
    // Regression (8a7457a): every new data set loaded one or more older blocks right away.
    it('shows exactly the candles of the range and loads one older block when zooming out', async () => {
      await generateWorld();
      await act(() => click(byTestId(page, 'lab.simulation.chart.range.1w')));
      await act(() => click(byTestId(page, 'lab.simulation.chart.resolution.15m')));
      const current = oracleCandles(0, '15m', WEEK_DAYS, oracle.now);
      const hours = oracleCandles(0, '1h', WEEK_DAYS, oracle.now).length;
      expect(shownCandles()).toBe(current.length);
      for (let round = 0; round < 2; round++) {
        await act(() => click(byTestId(page, 'lab.simulation.chart.resolution.1h')));
        expect(shownCandles()).toBe(hours);
        await act(() => click(byTestId(page, 'lab.simulation.chart.resolution.15m')));
        expect(shownCandles()).toBe(current.length);
      }

      await act(() => wheel(chartCanvas(), 100));

      // The block before the shown week, joined without duplicate candles.
      const older = oracleCandles(0, '15m', WEEK_DAYS, oracle.now - WEEK_DAYS * TICKS_PER_DAY - 1);
      const joined = new Set([...older, ...current].map((candle) => candle.tick));
      expect(shownCandles()).toBe(joined.size);
      expect(queryByTestId(page, 'lab.simulation.chart.loading-history')).toBeNull();
    });
  });

  describe('self-test', () => {
    it('computes the golden checksums in the worker without a world and finds them unchanged', async () => {
      await act(() => click(byTestId(page, 'lab.simulation.self-test.run')));

      for (const id of GOLDEN_CHECKSUM_IDS) {
        expect(textOf(byTestId(page, `lab.simulation.self-test.${id}.value`))).toBe(
          GOLDEN_CHECKSUMS[id],
        );
        expect(textOf(byTestId(page, `lab.simulation.self-test.${id}.status`))).toBe('stimmt');
      }
      expect(textOf(byTestId(page, 'lab.simulation.self-test.result'))).toBe(
        'Alle 6 Prüfsummen stimmen.',
      );
      expect(queryByTestId(page, 'lab.simulation.game-time')).toBeNull();
    });
  });
});
