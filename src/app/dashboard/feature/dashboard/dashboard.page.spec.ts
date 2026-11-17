import { TestBed } from '@angular/core/testing';
import { RouterTestingHarness } from '@angular/router/testing';
import { firstValueFrom, Observable, Subscription } from 'rxjs';

import { AccountId, DepotId } from '@app/banking/domain/models/account.model';
import { dayIndex } from '@app/clock/domain/calendar-logic';
import { EngineService } from '@app/engine/data-access/service/engine.service';
import {
  generateMiniWorld,
  InProcessEngine,
  provideInProcessEngineWorker,
} from '@app/engine/data-access/testing/in-process-engine-worker';
import { PositionView } from '@app/engine/domain/models/trading-view.model';
import { FakePlayerLocks } from '@app/persistence/data-access/testing/fake-player-locks';
import { PlayersService } from '@app/players/data-access/service/players.service';
import { providePlayersTestPorts } from '@app/players/data-access/testing/fake-players-ports';
import { NewPlayer } from '@app/players/domain/models/player.model';
import { PerformanceFigures } from '@app/portfolio/domain/models/performance.model';
import { historyFromDay } from '@app/portfolio/domain/performance-logic';

import { installChartPlatform } from '../../../../testing/chart-platform';
import { byTestId, click, queryByTestId, textOf } from '../../../../testing/dom';
import { renderRoute, settle } from '../../../../testing/page';
import { parseEuros, parseGermanNumber } from '../../../../testing/parse';
import { installViewport } from '../../../../testing/viewport';

const ANNA: NewPlayer = {
  name: 'Anna',
  seed: 'kupfer-falke-731',
  start: { startCapital: 1_000_000, netIncome: 250_000, livingCosts: 180_000 },
};

const WORLD = generateMiniWorld(ANNA.seed).world;
const COMPANY = WORLD.companies[0];
const ETF = WORLD.etfs[0];
const BROKER = WORLD.banks.find((bank) => bank.type === 'online-broker');
if (BROKER === undefined) {
  throw new Error('The mini world lacks an online broker');
}
const SALARY_ACCOUNT = 'acc-1' as AccountId;
const TEN_SHARES = 10_000_000;
const MS_PER_MINUTE = 60_000;

/** Tick of a game time given in UTC: game minutes since 01.01.2020, 00:00 (TS §3.2). */
function tickAt(utcMs: number): number {
  return (utcMs - Date.UTC(2020, 0, 1)) / MS_PER_MINUTE;
}

// AP 5.7 acceptance (US-PF-01, US-PF-04, US-PF-05, US-UI-10, TS §8.1): every tile of the dashboard
// with the values of the engine's public API, the period switch of the chart, „Demnächst“ with
// salary, base living costs, a standing order and a savings plan, and „Erste Schritte“ ticking off
// depot and purchase, hidden for good.
describe('DashboardPage', () => {
  let engine: InProcessEngine;
  let harness: RouterTestingHarness;
  let page: HTMLElement;
  let playerId: string;
  let service: EngineService;
  let restorePlatform: () => void;
  let restoreViewport: (() => void) | undefined;
  const subscriptions: Subscription[] = [];
  let figures: PerformanceFigures | null;
  const holdings = new Map<string, PositionView[]>();

  beforeEach(() => {
    localStorage.clear();
    holdings.clear();
    figures = null;
    restorePlatform = installChartPlatform();
  });

  afterEach(() => {
    subscriptions.splice(0).forEach((subscription) => subscription.unsubscribe());
    restoreViewport?.();
    restorePlatform();
  });

  async function start(width: number): Promise<void> {
    restoreViewport = installViewport(width);
    const locks = new FakePlayerLocks();
    engine = new InProcessEngine({ storage: 'indexed-db', locks });
    harness = await renderRoute('/players', [
      provideInProcessEngineWorker(engine),
      providePlayersTestPorts({ locks }),
    ]);
    page = harness.fixture.nativeElement;
    const { profile } = await firstValueFrom(TestBed.inject(PlayersService).createPlayer(ANNA));
    playerId = profile.id;
    service = TestBed.inject(EngineService);
    subscriptions.push(
      service.performance$.subscribe((update) => (figures = update.figures)),
      service.trading$.subscribe((update) => {
        for (const depot of update.depots) {
          holdings.set(depot.depotId, depot.positions);
        }
      }),
    );
  }

  async function run(ms: number): Promise<void> {
    await engine.advance(ms);
    await settle(harness.fixture);
  }

  async function act(action: () => void): Promise<void> {
    action();
    await settle(harness.fixture);
    await run(300);
  }

  async function open(path: string): Promise<void> {
    await harness.navigateByUrl(`/game/${playerId}/${path}`);
    await run(200);
    await run(300);
  }

  async function command<T>(reply: Observable<T>): Promise<T> {
    const result = firstValueFrom(reply);
    await run(200);
    return result;
  }

  function text(root: ParentNode, testId: string): string {
    return textOf(byTestId(root, testId));
  }

  function stepDone(step: string): string | null {
    return byTestId(page, `dashboard.first-steps.${step}`).getAttribute('data-done');
  }

  function upcomingRows(): { kind: string; date: string; amount: string | null }[] {
    return Array.from(
      page.querySelectorAll<HTMLElement>('[data-testid="dashboard.upcoming.row"]'),
    ).map((row) => {
      const amount = queryByTestId(row, 'dashboard.upcoming.row.amount');
      return {
        kind: row.dataset['kind'] ?? '',
        date: text(row, 'dashboard.upcoming.row.date'),
        amount: amount === null ? null : textOf(amount),
      };
    });
  }

  function figuresNow(): PerformanceFigures {
    if (figures === null) {
      throw new Error('no performance figures yet');
    }
    return figures;
  }

  /** Depot at the broker with 5.000 €, a standing order and a savings plan on the 2nd, 10 shares. */
  async function invest(): Promise<DepotId> {
    const { accountId, depotId } = await command(service.openAccount(BROKER!.id, 'depot'));
    await command(
      service.transfer({
        fromAccountId: SALARY_ACCOUNT,
        toAccountId: accountId,
        amount: 500_000,
        purpose: 'Depot',
      }),
    );
    await command(
      service.createStandingOrder({
        fromAccountId: SALARY_ACCOUNT,
        toAccountId: accountId,
        amount: 30_000,
        day: 2,
        purpose: 'Sparen',
      }),
    );
    await command(
      service.createSavingsPlan({
        depotId: depotId!,
        instrumentId: ETF.id,
        amount: 25_000,
        day: 2,
      }),
    );
    await command(
      service.placeOrder({
        depotId: depotId!,
        instrumentId: COMPANY.id,
        side: 'buy',
        type: 'market',
        size: { kind: 'quantity', quantity: TEN_SHARES },
        limit: null,
        stop: null,
        validity: { kind: 'gtc' },
      }),
    );
    for (let jump = 0; jump < 10 && holdings.get(depotId!)?.length !== 1; jump++) {
      await command(service.jumpTo({ kind: 'next-open' }));
      await run(500);
    }
    expect(holdings.get(depotId!)?.[0]?.quantity).toBe(TEN_SHARES);
    return depotId!;
  }

  it('shows every tile, the plannable dates and the first steps until hidden', async () => {
    await start(1280);
    await open('dashboard');
    await command(service.pause());
    await run(300);

    // Fresh player: every tile, nothing done yet, net worth as the engine reports it.
    for (const tile of [
      'net-worth',
      'history',
      'performance',
      'upcoming',
      'cashflow',
      'top-positions',
      'dividends',
      'watchlist',
      'notifications',
    ]) {
      expect(queryByTestId(page, `dashboard.${tile}`)).not.toBeNull();
    }
    expect(text(page, 'dashboard.first-steps.progress')).toBe('0 von 5 erledigt');
    expect(parseEuros(text(page, 'dashboard.net-worth.value'))).toBe(figuresNow().netWorth / 100);
    expect(queryByTestId(page, 'dashboard.top-positions.empty')).not.toBeNull();

    await invest();
    // Mo 22.04.2030, 10:00: the window of 14 days holds the salary of Tu 30.04., the living costs
    // of We 01.05. (the first bank working day) and both plans on Th 02.05.
    await command(service.jumpTo({ kind: 'date', tick: tickAt(Date.UTC(2030, 3, 22, 10)) }));
    await run(500);
    await open('banks');
    await open('dashboard');
    await run(600);

    const rows = upcomingRows();
    expect(rows.find((row) => row.kind === 'salary')).toEqual({
      kind: 'salary',
      date: '30.04.2030',
      amount: '+2.500,00 €',
    });
    // The base amount of the start conditions, not the varied amount the bank run will book.
    expect(rows.find((row) => row.kind === 'living-costs')).toEqual({
      kind: 'living-costs',
      date: '01.05.2030',
      amount: '−1.800,00 €',
    });
    expect(rows.find((row) => row.kind === 'standing-order')).toEqual({
      kind: 'standing-order',
      date: '02.05.2030',
      amount: '300,00 €',
    });
    expect(rows.find((row) => row.kind === 'savings-plan')).toEqual({
      kind: 'savings-plan',
      date: '02.05.2030',
      amount: '250,00 €',
    });
    const kinds = rows.map((row) => row.kind);
    expect(kinds.indexOf('salary')).toBeLessThan(kinds.indexOf('living-costs'));
    expect(kinds.indexOf('living-costs')).toBeLessThan(kinds.indexOf('standing-order'));

    // Net worth and performance as the engine's figures, at the displayed precision.
    const now = figuresNow();
    expect(parseEuros(text(page, 'dashboard.net-worth.value'))).toBe(now.netWorth / 100);
    expect(parseEuros(text(page, 'dashboard.net-worth.cash'))).toBe(now.cash / 100);
    expect(parseEuros(text(page, 'dashboard.net-worth.securities'))).toBe(now.securities / 100);
    expect(parseEuros(text(page, 'dashboard.net-worth.since-start'))).toBe(now.sinceStart / 100);
    const performance = byTestId(page, 'dashboard.performance.portfolio');
    expect(
      Math.abs(
        parseGermanNumber(text(performance, 'dashboard.performance.since-start')) -
          (now.returns.sinceStart ?? Number.NaN),
      ),
    ).toBeLessThanOrEqual(0.00005 + 1e-12);
    expect(text(performance, 'dashboard.performance.annualized')).toBe('–');
    expect(parseEuros(text(page, 'dashboard.performance.comparison'))).toBe(now.comparison / 100);

    // Cash flow of April from the engine's monthly values, summed here.
    const { current } = await command(service.monthlyValues());
    const { values } = current;
    expect(parseEuros(text(page, 'dashboard.cashflow.earnings'))).toBe(
      (values.income + values.creditInterest + values.dividends) / 100,
    );
    expect(parseEuros(text(page, 'dashboard.cashflow.spending'))).toBe(
      (values.livingCosts + values.fees + values.debitInterest + values.taxes) / 100,
    );

    // The share is the one top position, linked to its detail.
    const top = byTestId(page, 'dashboard.top-positions.row');
    expect(top.dataset['instrumentId']).toBe(COMPANY.id);
    expect(byTestId(top, 'dashboard.top-positions.row.name').getAttribute('href')).toContain(
      `/portfolio/${COMPANY.id}`,
    );

    // Depot, transfer, purchase and savings plan from the state, the bank comparison visited.
    for (const step of [
      'compare-banks',
      'open-depot',
      'transfer',
      'first-purchase',
      'savings-plan',
    ]) {
      expect(stepDone(step)).toBe('true');
    }

    // Period switch: the chart shows the series the engine returns for one month.
    await act(() => click(byTestId(page, 'dashboard.history.range.1m')));
    await run(300);
    expect(byTestId(page, 'dashboard.history.range.1m').getAttribute('aria-pressed')).toBe('true');
    const fromDay = historyFromDay('1m', dayIndex(figuresNow().tick));
    const { points } = await command(
      service.performanceHistory(fromDay === null ? {} : { fromDay }),
    );
    expect(byTestId(page, 'dashboard.history.chart').getAttribute('data-candle-count')).toBe(
      String(points.length),
    );
    await act(() => click(byTestId(page, 'dashboard.history.view.compare')));
    expect(queryByTestId(page, 'dashboard.history.legend.benchmark')).not.toBeNull();

    // Hidden, and still hidden after leaving the game and loading it again.
    await act(() => click(byTestId(page, 'dashboard.first-steps.hide')));
    expect(queryByTestId(page, 'dashboard.first-steps')).toBeNull();
    await harness.navigateByUrl('/players');
    await run(300);
    await open('dashboard');
    expect(queryByTestId(page, 'dashboard.first-steps')).toBeNull();
    expect(queryByTestId(page, 'dashboard.net-worth')).not.toBeNull();

    // Shown again with the button below the tiles, which then goes away.
    await act(() => click(byTestId(page, 'dashboard.first-steps.show')));
    expect(text(page, 'dashboard.first-steps.progress')).toBe('5 von 5 erledigt');
    expect(queryByTestId(page, 'dashboard.first-steps.show')).toBeNull();
  });

  it('stacks the tiles in one column on phones', async () => {
    await start(360);
    await open('dashboard');
    expect(queryByTestId(page, 'dashboard.first-steps')).not.toBeNull();
    expect(queryByTestId(page, 'dashboard.net-worth.value')).not.toBeNull();
    expect(queryByTestId(page, 'dashboard.upcoming')).not.toBeNull();
  });
});
