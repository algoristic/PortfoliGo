import { TestBed } from '@angular/core/testing';
import { RouterTestingHarness } from '@angular/router/testing';
import { firstValueFrom, Observable, Subscription } from 'rxjs';

import { AccountId, DepotId } from '@app/banking/domain/models/account.model';
import { TICKS_PER_DAY, TICKS_PER_HOUR } from '@app/clock/domain/models/time.model';
import { EngineService } from '@app/engine/data-access/service/engine.service';
import {
  generateMiniWorld,
  InProcessEngine,
  provideInProcessEngineWorker,
} from '@app/engine/data-access/testing/in-process-engine-worker';
import { OrderView, PositionView } from '@app/engine/domain/models/trading-view.model';
import { FakePlayerLocks } from '@app/persistence/data-access/testing/fake-player-locks';
import { PlayersService } from '@app/players/data-access/service/players.service';
import { providePlayersTestPorts } from '@app/players/data-access/testing/fake-players-ports';
import { NewPlayer } from '@app/players/domain/models/player.model';
import { OrderSide } from '@app/trading/domain/models/order.model';

import { installChartPlatform } from '../../../../testing/chart-platform';
import { byTestId, click, queryByTestId, textOf } from '../../../../testing/dom';
import { renderRoute, settle } from '../../../../testing/page';
import { parseEuros } from '../../../../testing/parse';
import { installViewport } from '../../../../testing/viewport';

const ANNA: NewPlayer = {
  name: 'Anna',
  seed: 'kupfer-falke-731',
  start: { startCapital: 10_000_000, netIncome: 250_000, livingCosts: 180_000 },
};

const WORLD = generateMiniWorld(ANNA.seed).world;
const BROKER = WORLD.banks.find((bank) => bank.type === 'online-broker');
if (BROKER === undefined) {
  throw new Error('The mini world lacks an online broker');
}
const SALARY_ACCOUNT = 'acc-1' as AccountId;
const SHARE = 1_000_000;

/** Cents of `cost × part / whole`, half away from zero (TS §7.6), independent of `lotCostShare`. */
function costShare(cost: number, part: number, whole: number): number {
  return Math.round((cost * part) / whole);
}

// AP 5.5 acceptance (US-PF-06): after two purchases and a partial sale the position detail shows
// the lot that FIFO leaves, the realized gain of the sale, the distribution earned at the ex-date
// and the three trades, marked in the chart; the expected values come from the engine's
// projection (lots before the sale, the sale's credit) and the dividend query, recomputed here.
describe('PositionPage', () => {
  let engine: InProcessEngine;
  let harness: RouterTestingHarness;
  let page: HTMLElement;
  let playerId: string;
  let service: EngineService;
  let restorePlatform: () => void;
  let restoreViewport: (() => void) | undefined;
  let subscription: Subscription | undefined;
  const holdings = new Map<string, PositionView[]>();
  const orders = new Map<string, OrderView>();

  beforeEach(() => {
    localStorage.clear();
    holdings.clear();
    orders.clear();
    restorePlatform = installChartPlatform();
  });

  afterEach(() => {
    subscription?.unsubscribe();
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
      for (const order of update.orders) {
        orders.set(order.id, order);
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

  function all(testId: string): HTMLElement[] {
    return Array.from(page.querySelectorAll<HTMLElement>(`[data-testid="${testId}"]`));
  }

  function held(depotId: DepotId, instrumentId: string): PositionView | undefined {
    return holdings.get(depotId)?.find((position) => position.instrumentId === instrumentId);
  }

  /** Places a market order and jumps to the next opens until it executed. */
  async function trade(
    depotId: DepotId,
    instrumentId: string,
    side: OrderSide,
    shares: number,
  ): Promise<OrderView> {
    const { orderId } = await command(
      service.placeOrder({
        depotId,
        instrumentId,
        side,
        type: 'market',
        size: { kind: 'quantity', quantity: shares * SHARE },
        limit: null,
        stop: null,
        validity: { kind: 'gtc' },
      }),
    );
    for (let jump = 0; jump < 10 && orders.get(orderId)?.status !== 'executed'; jump++) {
      await command(service.jumpTo({ kind: 'next-open' }));
      await run(500);
    }
    const order = orders.get(orderId);
    expect(order?.status).toBe('executed');
    return order!;
  }

  it('shows lots, realized gain, distribution and trades after two purchases and a partial sale', async () => {
    await start(1024);
    await open('portfolio');
    await command(service.pause());
    const { accountId, depotId } = await command(service.openAccount(BROKER!.id, 'depot'));
    const { tick: now } = await command(
      service.transfer({
        fromAccountId: SALARY_ACCOUNT,
        toAccountId: accountId,
        amount: 90_000_00,
        purpose: 'Depot',
      }),
    );
    const depot = depotId!;

    // The share with the nearest ex-date at least ten days ahead: the trades fit before it.
    const today = Math.floor(now / TICKS_PER_DAY);
    let share: { id: string; exDay: number } | undefined;
    for (const company of WORLD.companies) {
      const dividends = await command(service.instrumentDividends(company.id));
      const exDay = dividends.next?.exDay;
      if (
        exDay !== undefined &&
        exDay >= today + 10 &&
        (share === undefined || exDay < share.exDay)
      ) {
        share = { id: company.id, exDay };
      }
    }
    if (share === undefined) {
      throw new Error('no share of the mini world has an ex-date ahead');
    }

    await trade(depot, share.id, 'buy', 10);
    await trade(depot, share.id, 'buy', 5);
    const [first, second] = held(depot, share.id)!.lots;
    expect(second?.quantity).toBe(5 * SHARE);
    const sale = await trade(depot, share.id, 'sell', 12);
    expect(Math.floor(sale.execution!.tick / TICKS_PER_DAY)).toBeLessThan(share.exDay);

    // TS §7.6: FIFO takes the first lot and 2 of the second; 3 shares of it stay.
    const soldCost = first.cost + costShare(second.cost, 2, 5);
    const remainingCost = second.cost - costShare(second.cost, 2, 5);
    const realized = sale.execution!.total - soldCost;
    expect(held(depot, share.id)?.realizedGain).toBe(realized);

    await command(
      service.jumpTo({ kind: 'date', tick: share.exDay * TICKS_PER_DAY + 23 * TICKS_PER_HOUR }),
    );
    for (let pass = 0; pass < 60 && (held(depot, share.id)?.distributions ?? 0) === 0; pass++) {
      await run(1_000);
    }
    const dividends = await command(service.instrumentDividends(share.id));
    const payment = dividends.history.find(({ exDay }) => exDay === share.exDay);
    expect(payment).toBeDefined();
    const distribution = Math.round(3 * payment!.cents);
    expect(held(depot, share.id)?.distributions).toBe(distribution);

    // From the depot page to the detail through the position's name.
    await open('portfolio');
    const row = all('portfolio.positions.row').find(
      (element) => element.dataset['instrumentId'] === share.id,
    );
    await act(() => click(byTestId(row!, 'portfolio.positions.row.name')));
    await run(300);
    expect(text(page, 'portfolio.position.quantity')).toBe('3');
    expect(parseEuros(text(page, 'portfolio.position.cost'))).toBe(remainingCost / 100);
    expect(parseEuros(text(page, 'portfolio.position.realized-gain'))).toBe(realized / 100);
    expect(parseEuros(text(page, 'portfolio.position.distributions'))).toBe(distribution / 100);

    const lots = all('portfolio.position.lots.row');
    expect(lots).toHaveLength(1);
    expect(text(lots[0], 'portfolio.position.lots.row.quantity')).toBe('3');
    expect(parseEuros(text(lots[0], 'portfolio.position.lots.row.cost'))).toBe(remainingCost / 100);
    expect(queryByTestId(lots[0], 'portfolio.position.lots.row.depot')).toBeNull();

    const trades = all('portfolio.position.trades.row');
    expect(trades.map((element) => element.dataset['side'])).toEqual(['sell', 'buy', 'buy']);
    expect(trades.map((element) => text(element, 'portfolio.position.trades.row.side'))).toEqual([
      'Verkauf',
      'Kauf',
      'Kauf',
    ]);
    expect(text(trades[0], 'portfolio.position.trades.row.quantity')).toBe('12');
    expect(parseEuros(text(trades[0], 'portfolio.position.trades.row.total'))).toBe(
      sale.execution!.total / 100,
    );

    // A month of hourly candles holds the three trades; the chart marks each of them.
    await act(() => click(byTestId(page, 'market.instrument.chart.range.1m')));
    await run(500);
    const markers = byTestId(page, 'market.instrument.chart').getAttribute('data-markers') ?? '';
    expect(markers.split(' ').map((marker) => marker.split(':')[0])).toEqual([
      'buy',
      'buy',
      'sell',
    ]);

    // „Verkaufen“ opens the ticket for the shown depot.
    await act(() => click(byTestId(page, 'trading.trade-actions.sell')));
    expect(byTestId<HTMLSelectElement>(document.body, 'trading.order-ticket.depot').value).toBe(
      depot,
    );
    await act(() => click(byTestId(document.body, 'trading.order-ticket.decline')));
  });

  it('shows an empty state with a link to the instrument page without shares', async () => {
    await start(360);
    const company = WORLD.companies[0];
    await open(`portfolio/${company.id}`);
    expect(queryByTestId(page, 'portfolio.position.empty')).not.toBeNull();
    expect(queryByTestId(page, 'portfolio.position.trades.empty')).not.toBeNull();
    await act(() => click(byTestId(page, 'portfolio.position.instrument')));
    await run(300);
    expect(queryByTestId(page, 'market.instrument.name')).not.toBeNull();
    expect(queryByTestId(page, 'portfolio.position.empty')).toBeNull();
  });
});
