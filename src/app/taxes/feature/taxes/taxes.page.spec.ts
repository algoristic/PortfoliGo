import { TestBed } from '@angular/core/testing';
import { RouterTestingHarness } from '@angular/router/testing';
import { firstValueFrom, Observable, Subscription } from 'rxjs';

import { AccountId, DepotId } from '@app/banking/domain/models/account.model';
import { TICKS_PER_DAY } from '@app/clock/domain/models/time.model';
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
import { TaxYear } from '@app/taxes/domain/models/tax.model';

import { byTestId, textOf } from '../../../../testing/dom';
import { renderRoute, settle } from '../../../../testing/page';
import { parseEuros } from '../../../../testing/parse';
import { installViewport } from '../../../../testing/viewport';

const ANNA: NewPlayer = {
  name: 'Anna',
  seed: 'kupfer-falke-731',
  start: { startCapital: 100_000_000, netIncome: 250_000, livingCosts: 180_000 },
};

const WORLD = generateMiniWorld(ANNA.seed).world;
const SHARES = WORLD.companies.slice(0, 6);
const BROKER = WORLD.banks.find((bank) => bank.type === 'online-broker');
if (BROKER === undefined) {
  throw new Error('The mini world lacks an online broker');
}
const SALARY_ACCOUNT = 'acc-1' as AccountId;

// TS §7.7: 25 % on the income of the year above the saver's allowance of 1.000 €.
const ALLOWANCE_CENTS = 100_000;

// AP 5.5 acceptance (US-ST-04): after a sale with a gain above the saver's allowance the tax page
// shows the running year with the gain, the allowance used up and the tax withheld. The expected
// figures are computed here from the sale's realized gain (credit after costs − cost of the lots,
// TS §7.6) and the credit interest of the year as the engine reports it.
describe('TaxesPage', () => {
  let engine: InProcessEngine;
  let harness: RouterTestingHarness;
  let page: HTMLElement;
  let playerId: string;
  let service: EngineService;
  let restoreViewport: (() => void) | undefined;
  const subscriptions: Subscription[] = [];
  const holdings = new Map<string, PositionView[]>();
  const orders = new Map<string, OrderView>();
  const bids = new Map<string, number>();
  let taxYear: TaxYear | null = null;

  beforeEach(() => {
    localStorage.clear();
    holdings.clear();
    orders.clear();
    bids.clear();
    taxYear = null;
  });

  afterEach(() => {
    subscriptions.splice(0).forEach((subscription) => subscription.unsubscribe());
    restoreViewport?.();
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
      service.trading$.subscribe((update) => {
        for (const depot of update.depots) {
          holdings.set(depot.depotId, depot.positions);
        }
        for (const order of update.orders) {
          orders.set(order.id, order);
        }
      }),
      service.taxes$.subscribe((update) => (taxYear = update.current)),
    );
  }

  async function run(ms: number): Promise<void> {
    await engine.advance(ms);
    await settle(harness.fixture);
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

  async function watchBids(): Promise<void> {
    const { instruments } = await command(service.instruments());
    const ids = SHARES.map((share) => share.id);
    const series = ids.map((id) => instruments.find((instrument) => instrument.id === id)!.series);
    subscriptions.push(
      service.quotes(series).subscribe((quotes) => {
        for (const quote of quotes) {
          const id = ids[series.indexOf(quote.series)];
          if (id !== undefined && quote.bid !== null) {
            bids.set(id, quote.bid);
          }
        }
      }),
    );
  }

  /** Places a market order and jumps to the next opens until it executed. */
  async function execute(orderId: string): Promise<OrderView> {
    for (let jump = 0; jump < 10 && orders.get(orderId)?.status !== 'executed'; jump++) {
      await command(service.jumpTo({ kind: 'next-open' }));
      await run(500);
    }
    expect(orders.get(orderId)?.status).toBe('executed');
    return orders.get(orderId)!;
  }

  function held(depotId: DepotId): PositionView[] {
    return holdings.get(depotId) ?? [];
  }

  function text(testId: string): string {
    return textOf(byTestId(byTestId(page, 'taxes.year'), testId));
  }

  it('shows the running year after a sale with a gain above the allowance', async () => {
    await start(360);
    await open('taxes');
    await command(service.pause());
    await watchBids();
    const { accountId, depotId } = await command(service.openAccount(BROKER!.id, 'depot'));
    const { tick: now } = await command(
      service.transfer({
        fromAccountId: SALARY_ACCOUNT,
        toAccountId: accountId,
        amount: 900_000_00,
        purpose: 'Depot',
      }),
    );
    const depot = depotId!;

    // 150.000 € in each of six shares; a month later the largest gain is sold.
    const placed = [];
    for (const share of SHARES) {
      const { orderId } = await command(
        service.placeOrder({
          depotId: depot,
          instrumentId: share.id,
          side: 'buy',
          type: 'market',
          size: { kind: 'amount', amount: 150_000_00 },
          limit: null,
          stop: null,
          validity: { kind: 'gtc' },
        }),
      );
      placed.push(orderId);
    }
    for (const orderId of placed) {
      await execute(orderId);
    }
    await command(service.jumpTo({ kind: 'date', tick: now + 30 * TICKS_PER_DAY }));
    await run(2_000);
    const [best] = held(depot)
      .map((position) => ({
        position,
        gain: Math.round((position.quantity / 1_000_000) * bids.get(position.instrumentId)! * 100),
      }))
      .map(({ position, gain }) => ({ position, gain: gain - position.cost }))
      .sort((a, b) => b.gain - a.gain);
    expect(best.gain).toBeGreaterThan(2 * ALLOWANCE_CENTS);

    const { orderId } = await command(
      service.placeOrder({
        depotId: depot,
        instrumentId: best.position.instrumentId,
        side: 'sell',
        type: 'market',
        size: { kind: 'quantity', quantity: best.position.quantity },
        limit: null,
        stop: null,
        validity: { kind: 'gtc' },
      }),
    );
    const sale = await execute(orderId);
    const realized = sale.execution!.total - best.position.cost;
    expect(realized).toBeGreaterThan(ALLOWANCE_CENTS);

    await open('taxes');
    const { interest, distributions } = taxYear!;
    const income = realized + interest + distributions;
    const tax = Math.round(0.25 * (income - ALLOWANCE_CENTS));

    expect(byTestId(page, 'taxes.year').dataset['year']).toBe(String(taxYear!.year));
    expect(byTestId(page, 'taxes.year.current')).toBeTruthy();
    expect(parseEuros(text('taxes.year.gains'))).toBe(realized / 100);
    expect(parseEuros(text('taxes.year.losses'))).toBe(0);
    expect(parseEuros(text('taxes.year.interest'))).toBe(interest / 100);
    expect(parseEuros(text('taxes.year.distributions'))).toBe(distributions / 100);
    expect(parseEuros(text('taxes.year.income'))).toBe(income / 100);
    expect(parseEuros(text('taxes.year.used-allowance'))).toBe(1_000);
    expect(byTestId(page, 'taxes.year.allowance-bar').getAttribute('aria-valuenow')).toBe('100');
    expect(parseEuros(text('taxes.year.paid'))).toBe(tax / 100);
    expect(parseEuros(text('taxes.year.withheld'))).toBe(tax / 100);
    expect(parseEuros(text('taxes.year.refunded'))).toBe(0);
    expect(parseEuros(text('taxes.year.loss-carry-forward-out'))).toBe(0);
  });
});
