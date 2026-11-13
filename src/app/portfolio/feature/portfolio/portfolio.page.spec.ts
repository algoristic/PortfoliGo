import { TestBed } from '@angular/core/testing';
import { RouterTestingHarness } from '@angular/router/testing';
import { firstValueFrom, Observable, Subscription } from 'rxjs';

import { AccountId, DepotId } from '@app/banking/domain/models/account.model';
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

import { installChartPlatform } from '../../../../testing/chart-platform';
import { byTestId, click, queryByTestId, select, textOf } from '../../../../testing/dom';
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

/** Euros rounded half away from zero to cents, independent of the money functions (TS §7.1). */
function cents(euros: number): number {
  return Math.round(Number((euros * 100).toPrecision(12))) / 100;
}

// AP 5.5 acceptance (US-PF-02, US-PF-03): the depot page shows the positions as the engine holds
// them, valued at the bid without mark-up; the table sorts; selling from a row opens the ticket in
// that depot; the allocation by region looks through the ETF; cards on phones.
describe('PortfolioPage', () => {
  let engine: InProcessEngine;
  let harness: RouterTestingHarness;
  let page: HTMLElement;
  let playerId: string;
  let service: EngineService;
  let restorePlatform: () => void;
  let restoreViewport: (() => void) | undefined;
  let subscription: Subscription | undefined;
  let quoteSubscription: Subscription | undefined;
  const bids = new Map<string, number>();
  /** Positions per depot as the engine's trading projection reported them last. */
  const holdings = new Map<string, PositionView[]>();

  beforeEach(async () => {
    localStorage.clear();
    holdings.clear();
    bids.clear();
    restorePlatform = installChartPlatform();
  });

  afterEach(() => {
    subscription?.unsubscribe();
    quoteSubscription?.unsubscribe();
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
    subscription = service.trading$.subscribe((update) => {
      for (const depot of update.depots) {
        holdings.set(depot.depotId, depot.positions);
      }
    });
  }

  async function run(ms: number): Promise<void> {
    await engine.advance(ms);
    await settle(harness.fixture);
  }

  async function act(action: () => void): Promise<void> {
    action();
    await settle(harness.fixture);
    await run(200);
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

  function rows(): HTMLElement[] {
    return Array.from(
      page.querySelectorAll<HTMLElement>('[data-testid="portfolio.positions.row"]'),
    );
  }

  function row(instrumentId: string): HTMLElement {
    const found = rows().find((candidate) => candidate.dataset['instrumentId'] === instrumentId);
    if (found === undefined) {
      throw new Error(`no row for ${instrumentId}`);
    }
    return found;
  }

  /**
   * The bid of an instrument from the engine's public quote stream, subscribed before the
   * purchases: the worker sends the quotes of subscribed series as the time moves.
   */
  function bid(instrumentId: string): number {
    const quote = bids.get(instrumentId);
    if (quote === undefined) {
      throw new Error(`no bid for ${instrumentId}`);
    }
    return quote;
  }

  async function watchBids(): Promise<void> {
    const { instruments } = await command(service.instruments());
    const ids = [COMPANY.id, ETF.id];
    const series = ids.map((id) => instruments.find((instrument) => instrument.id === id)!.series);
    quoteSubscription = service.quotes(series).subscribe((quotes) => {
      for (const quote of quotes) {
        const id = ids[series.indexOf(quote.series)];
        if (id !== undefined && quote.bid !== null) {
          bids.set(id, quote.bid);
        }
      }
    });
  }

  async function openDepot(euros: number): Promise<DepotId> {
    const { accountId, depotId } = await command(service.openAccount(BROKER!.id, 'depot'));
    await command(
      service.transfer({
        fromAccountId: SALARY_ACCOUNT,
        toAccountId: accountId,
        amount: euros * 100,
        purpose: 'Depot',
      }),
    );
    return depotId!;
  }

  async function buyTen(depotId: DepotId, instrumentId: string): Promise<void> {
    await command(
      service.placeOrder({
        depotId,
        instrumentId,
        side: 'buy',
        type: 'market',
        size: { kind: 'quantity', quantity: TEN_SHARES },
        limit: null,
        stop: null,
        validity: { kind: 'gtc' },
      }),
    );
  }

  function held(depotId: DepotId, instrumentId: string): PositionView | undefined {
    return holdings.get(depotId)?.find((position) => position.instrumentId === instrumentId);
  }

  /**
   * Two depots: depot A buys 10 shares of the company, depot B 10 shares of the company and 10 of
   * the ETF, all at market; jumps to the next opens until every order executed. Paused, so the
   * quotes stand still while the test reads the page.
   */
  async function buyPortfolio(): Promise<{ depotA: DepotId; depotB: DepotId }> {
    await open('portfolio');
    await watchBids();
    await command(service.pause());
    const depotA = await openDepot(3_000);
    const depotB = await openDepot(5_000);
    await buyTen(depotA, COMPANY.id);
    await buyTen(depotB, COMPANY.id);
    await buyTen(depotB, ETF.id);
    for (let jump = 0; jump < 4 && held(depotB, ETF.id) === undefined; jump++) {
      await command(service.jumpTo({ kind: 'next-open' }));
      await run(500);
    }
    for (let jump = 0; jump < 4 && held(depotA, COMPANY.id) === undefined; jump++) {
      await command(service.jumpTo({ kind: 'next-open' }));
      await run(500);
    }
    expect(held(depotA, COMPANY.id)?.quantity).toBe(TEN_SHARES);
    expect(held(depotB, COMPANY.id)?.quantity).toBe(TEN_SHARES);
    expect(held(depotB, ETF.id)?.quantity).toBe(TEN_SHARES);
    // Leave the page and end the test's subscription, so that the page subscribes the series
    // anew; the worker sends the quotes of a series when it is subscribed.
    await open('accounts');
    quoteSubscription?.unsubscribe();
    await open('portfolio');
    return { depotA, depotB };
  }

  it('shows the empty state without a depot and opens „Konto eröffnen“ with a depot', async () => {
    await start(1024);
    await open('portfolio');
    expect(queryByTestId(page, 'portfolio.empty.no-depot')).not.toBeNull();
    await act(() => click(byTestId(page, 'portfolio.empty.open-depot')));
    expect(
      byTestId<HTMLInputElement>(document.body, 'banking.open-account-dialog.kind.depot').checked,
    ).toBe(true);
  });

  it('shows positions as the engine holds them, sorts, sells from a row and looks through the ETF', async () => {
    await start(1024);
    const { depotA, depotB } = await buyPortfolio();
    const shareBid = bid(COMPANY.id);
    const etfBid = bid(ETF.id);

    // All depots combined: the share once with 20 shares and the costs of both purchases.
    expect(
      rows()
        .map((element) => element.dataset['instrumentId'])
        .sort(),
    ).toEqual([COMPANY.id, ETF.id].sort());
    const shareCost = (held(depotA, COMPANY.id)!.cost + held(depotB, COMPANY.id)!.cost) / 100;
    const share = row(COMPANY.id);
    expect(text(share, 'portfolio.positions.row.quantity')).toBe('20');
    expect(
      Math.abs(parseEuros(text(share, 'portfolio.positions.row.average-cost')) - shareCost / 20),
    ).toBeLessThanOrEqual(0.005 + 1e-9);
    expect(parseEuros(text(share, 'portfolio.positions.row.price'))).toBe(shareBid);
    const shareValue = cents(20 * shareBid);
    expect(parseEuros(text(share, 'portfolio.positions.row.value'))).toBe(shareValue);
    expect(parseEuros(text(share, 'portfolio.positions.row.gain'))).toBe(
      cents(shareValue - shareCost),
    );

    const etfCost = held(depotB, ETF.id)!.cost / 100;
    const etfValue = cents(10 * etfBid);
    const etf = row(ETF.id);
    expect(text(etf, 'portfolio.positions.row.quantity')).toBe('10');
    expect(parseEuros(text(etf, 'portfolio.positions.row.value'))).toBe(etfValue);
    const total = cents(shareValue + etfValue);
    expect(parseEuros(text(page, 'portfolio.positions.total.value'))).toBe(total);
    expect(parseEuros(text(page, 'portfolio.positions.total.cost'))).toBe(
      cents(shareCost + etfCost),
    );
    expect(parseGermanNumber(text(etf, 'portfolio.positions.row.share'))).toBeCloseTo(
      etfValue / total,
      3,
    );

    // Sorting by name, then reversed (`aria-sort` on the header).
    const byName = [COMPANY.name, ETF.name].sort((a, b) => a.localeCompare(b, 'de'));
    await act(() => click(byTestId(page, 'portfolio.positions.sort.name')));
    expect(rows().map((element) => text(element, 'portfolio.positions.row.name'))).toEqual(byName);
    const nameHeader = byTestId(page, 'portfolio.positions.sort.name').closest('th');
    expect(nameHeader?.getAttribute('aria-sort')).toBe('ascending');
    await act(() => click(byTestId(page, 'portfolio.positions.sort.name')));
    expect(rows().map((element) => text(element, 'portfolio.positions.row.name'))).toEqual(
      [...byName].reverse(),
    );
    expect(nameHeader?.getAttribute('aria-sort')).toBe('descending');

    // Depot B alone; „Verkaufen“ opens the ticket in depot B, not in the first depot A.
    await act(() => select(byTestId<HTMLSelectElement>(page, 'portfolio.depot'), depotB));
    expect(text(row(COMPANY.id), 'portfolio.positions.row.quantity')).toBe('10');
    await act(() => click(byTestId(row(COMPANY.id), 'portfolio.positions.row.sell')));
    expect(byTestId<HTMLSelectElement>(document.body, 'trading.order-ticket.depot').value).toBe(
      depotB,
    );
    expect(
      byTestId<HTMLInputElement>(document.body, 'trading.order-ticket.side.sell').checked,
    ).toBe(true);
    await act(() => click(byTestId(document.body, 'trading.order-ticket.decline')));

    // Allocation by region of depot B: the ETF's value split by the weights of its index.
    const { composition } = await command(service.instrumentComposition(ETF.id));
    const expected = new Map<string, number>();
    for (const { key, weight } of composition?.regions ?? []) {
      expected.set(key, etfValue * weight);
    }
    const company = WORLD.companies[0];
    expected.set(company.regionId, (expected.get(company.regionId) ?? 0) + 10 * shareBid);
    await act(() => click(byTestId(page, 'portfolio.allocation.tabs.region.tab')));
    const items = Array.from(
      page.querySelectorAll<HTMLElement>('[data-testid="portfolio.allocation.region.item"]'),
    );
    expect(items.map((item) => item.dataset['key']).sort()).toEqual(
      [...expected.entries()]
        .filter(([, value]) => value >= 0.005)
        .map(([key]) => key)
        .sort(),
    );
    for (const item of items) {
      const value = parseEuros(text(item, 'portfolio.allocation.item.value'));
      expect(Math.abs(value - (expected.get(item.dataset['key'] ?? '') ?? 0))).toBeLessThan(0.02);
    }
    expect(queryByTestId(page, 'portfolio.allocation.region')).not.toBeNull();
  });

  it('shows cards with a sort choice on phones', async () => {
    await start(360);
    await buyPortfolio();
    expect(queryByTestId(page, 'portfolio.positions.table')).toBeNull();
    expect(queryByTestId(page, 'portfolio.positions.list')).not.toBeNull();
    await act(() =>
      select(byTestId<HTMLSelectElement>(page, 'portfolio.positions.sort-key'), 'name'),
    );
    const byName = [COMPANY.name, ETF.name].sort((a, b) => a.localeCompare(b, 'de'));
    expect(rows().map((element) => text(element, 'portfolio.positions.row.name'))).toEqual(byName);
    await act(() => click(byTestId(page, 'portfolio.positions.sort-direction')));
    expect(rows().map((element) => text(element, 'portfolio.positions.row.name'))).toEqual(
      [...byName].reverse(),
    );
  });
});
