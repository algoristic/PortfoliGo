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
import { LAB_SEED_COMPARISON } from '../../data-access/service/lab-simulation-service.config';
import { provideInProcessLabWorker } from '../../data-access/testing/in-process-lab-worker';
import { LabSimulation } from '../../domain/lab-simulation';
import { LabStatistics, SeedRun } from '../../domain/models/lab-statistics.model';

const SEED = TEST_SEEDS.page;
/** A short seed comparison: two seeds over one year after the game start. */
const COMPARISON = { seeds: ['calib-1', 'calib-2'], years: 1 };

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
    harness = await renderRoute('/lab/simulation', [
      provideInProcessLabWorker(),
      { provide: LAB_SEED_COMPARISON, useValue: COMPARISON },
    ]);
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

    it('opens a row of the world overview in the chart and scrolls up to it', async () => {
      await generateWorld();
      const scroll = vi.spyOn(Element.prototype, 'scrollIntoView');
      const overview = oracle.overview();

      const share = overview.series.filter((option) => option.kind === 'stock')[2];
      await act(() => click(byTestId(page, `lab.simulation.companies.${share.id}.open`)));
      expect(textOf(byTestId(page, 'lab.simulation.chart.series-name'))).toContain(share.name);
      expect(shownCandles()).toBe(oracleCandles(share.series, '1d', YEAR_DAYS, oracle.now).length);
      expect(scroll).toHaveBeenCalledTimes(1);

      // An ETF row opens the ETF, not the series at its position in the table.
      const etf = overview.series.filter((option) => option.kind === 'etf')[1];
      await act(() => click(byTestId(page, 'lab.simulation.world-tabs.etfs.tab')));
      await act(() => click(byTestId(page, `lab.simulation.etfs.${etf.id}.open`)));
      expect(textOf(byTestId(page, 'lab.simulation.chart.series-name'))).toContain(etf.name);
      expect(scroll).toHaveBeenCalledTimes(2);
      scroll.mockRestore();
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

  /** Checks the shown checkpoints of the given years against the oracle's statistics. */
  function expectCheckpoints(expected: LabStatistics, years: number[]): void {
    for (const checkpoint of expected.longTerm.checkpoints.filter((c) => years.includes(c.years))) {
      const prefix = `lab.simulation.statistics.long-term.${checkpoint.years}`;
      expectShown(`${prefix}.top-five`, checkpoint.topFiveShare, 1, true);
      expectShown(`${prefix}.below-one-euro`, checkpoint.belowOneEuro.all, 1, true);
      expectShown(`${prefix}.at-floor`, checkpoint.atFloor, 1, true);
      expectShown(`${prefix}.index-volatility`, checkpoint.indexVolatility, 1, true);
    }
  }

  describe('statistics', () => {
    /** Statistics of the prehistory from the epoch. */
    let expected: LabStatistics;

    beforeAll(() => {
      expected = oracle.statistics('epoch');
    });

    it('measures the period from the epoch, drops it after a simulation and measures from the game start', async () => {
      await generateWorld();
      await act(() => click(byTestId(page, 'lab.simulation.statistics.compute')));
      const target = (id: string): number =>
        expected.targets.find((row) => row.id === id)?.value ?? Number.NaN;

      // Intraday measures of the last market days, overnight shares and the intraday profile.
      const { intraday } = expected;
      expectShown(
        'lab.simulation.statistics.intraday.minuteVolatility.stocks',
        intraday.stocks.minuteVolatility,
        1,
        true,
      );
      expectShown(
        'lab.simulation.statistics.intraday.dailyRange.world-index',
        intraday.worldIndex.dailyRange,
        2,
        true,
      );
      expectShown(
        'lab.simulation.statistics.intraday.sessionVolatility.reference',
        intraday.reference.reference.sessionVolatility,
        1,
        true,
      );
      expectShown('lab.simulation.statistics.intraday.profile-ratio', intraday.profileRatio, 2);
      expect(
        page.querySelectorAll('[data-testid="lab.simulation.statistics.intraday.profile.bar"]'),
      ).toHaveLength(13);
      // The world index is shown for information; the regions and the stocks have targets
      // (TS §6.9, E-24).
      const statusTexts = { ok: 'im Ziel', off: 'abweichend', short: 'zu kurz', info: 'Info' };
      for (const id of [
        'overnight-share-world',
        'overnight-share-north-america',
        'overnight-share-europe',
        'overnight-share-asia-pacific',
        'overnight-share-emerging-markets',
        'overnight-share-stocks',
      ]) {
        expectShown(`lab.simulation.statistics.target.${id}.value`, target(id), 1, true);
        const status = expected.targets.find((row) => row.id === id)?.status ?? 'info';
        expect(textOf(byTestId(page, `lab.simulation.statistics.target.${id}.status`))).toBe(
          statusTexts[status],
        );
      }
      expect(
        textOf(byTestId(page, 'lab.simulation.statistics.target.overnight-share-world.status')),
      ).toBe('Info');
      // The prehistory ends at the game start: only the first checkpoint, and one ten-year window.
      expectCheckpoints(expected, [0]);
      expect(textOf(byTestId(page, 'lab.simulation.statistics.long-term.10.top-five'))).toBe('–');
      expect(queryByTestId(page, 'lab.simulation.statistics.long-term.hint')).not.toBeNull();
      // Limits of E-22 (TS §6.9).
      expect(textOf(byTestId(page, 'lab.simulation.statistics.long-term.limit.top-five'))).toBe(
        '≤ 40,0 %',
      );
      expect(textOf(byTestId(page, 'lab.simulation.statistics.long-term.limit.max-price'))).toBe(
        '–',
      );
      expect(textOf(byTestId(page, 'lab.simulation.statistics.window.10.volatility.limit'))).toBe(
        '13,0 % – 20,0 %',
      );
      expect(
        textOf(byTestId(page, 'lab.simulation.statistics.window.30.dividend-yield.limit')),
      ).toBe('≥ 1,5 %');
      expectShown(
        'lab.simulation.statistics.window.10.total-return.median',
        expected.longTerm.windows[0].totalReturn.median,
        1,
        true,
      );

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

  describe('long term', () => {
    /** Statistics of the same world ten years after the game start. */
    let expected: LabStatistics;

    beforeAll(() => {
      const later = new LabSimulation(SEED);
      later.runPrehistory();
      later.simulateYears(10);
      expected = later.statistics('epoch');
    });

    it('shows the checkpoint ten years after the game start', async () => {
      await generateWorld();
      await act(() => click(byTestId(page, 'lab.simulation.simulate.10y')));
      await act(() => click(byTestId(page, 'lab.simulation.statistics.compute')));

      expectCheckpoints(expected, [0, 10]);
      expect(textOf(byTestId(page, 'lab.simulation.statistics.long-term.25.top-five'))).toBe('–');
    });
  });

  describe('seed comparison', () => {
    let runs: SeedRun[];

    beforeAll(() => {
      runs = COMPARISON.seeds.map((seed) => LabSimulation.measureSeedRun(seed, COMPARISON.years));
    });

    it('runs the seeds one after the other, without a world, and shows their median', async () => {
      await act(() => click(byTestId(page, 'lab.simulation.seeds.compare')));

      for (const run of runs) {
        const tenYears = run.longTerm.windows.find((window) => window.years === 10);
        expectShown(
          `lab.simulation.seeds.${run.seed}.return-10`,
          tenYears?.totalReturn.median ?? Number.NaN,
          1,
          true,
        );
        const crisis = run.phaseShares.find((share) => share.phase === 'crisis');
        expectShown(`lab.simulation.seeds.${run.seed}.crisis-share`, crisis?.share ?? 0, 1, true);
      }
      // Two seeds: the median is their mean.
      const volatility = runs.map(
        (run) => run.longTerm.windows.find((window) => window.years === 10)?.volatility.median ?? 0,
      );
      expectShown(
        'lab.simulation.seeds.median.volatility-10',
        (volatility[0] + volatility[1]) / 2,
        1,
        true,
      );
      // One year after the game start reaches no checkpoint after 50 years.
      expect(textOf(byTestId(page, `lab.simulation.seeds.${runs[0].seed}.top-five-50`))).toBe('–');
      expect(queryByTestId(page, 'lab.simulation.seeds.progress')).toBeNull();
      expect(queryByTestId(page, 'lab.simulation.seeds.duration')).not.toBeNull();
      expect(queryByTestId(page, 'lab.simulation.game-time')).toBeNull();
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
