import { TestBed } from '@angular/core/testing';
import { RouterTestingHarness } from '@angular/router/testing';
import { firstValueFrom } from 'rxjs';

import {
  generateMiniWorld,
  InProcessEngine,
  provideInProcessEngineWorker,
} from '@app/engine/data-access/testing/in-process-engine-worker';
import { FakePlayerLocks } from '@app/persistence/data-access/testing/fake-player-locks';
import { PlayersService } from '@app/players/data-access/service/players.service';
import { providePlayersTestPorts } from '@app/players/data-access/testing/fake-players-ports';
import { NewPlayer } from '@app/players/domain/models/player.model';
import { EXCHANGES } from '@app/world/domain/taxonomy';

import { installChartPlatform } from '../../../../testing/chart-platform';
import { byTestId, click, queryByTestId, select, textOf, typeText } from '../../../../testing/dom';
import { renderRoute, settle } from '../../../../testing/page';
import { parseEuros } from '../../../../testing/parse';
import { installViewport } from '../../../../testing/viewport';

const ANNA: NewPlayer = {
  name: 'Anna',
  seed: 'kupfer-falke-731',
  start: { startCapital: 1_000_000, netIncome: 250_000, livingCosts: 180_000 },
};

const WORLD = generateMiniWorld(ANNA.seed).world;
const COMPANY = WORLD.companies[0];
const INDEX = WORLD.indices[0];
// An online broker without fractional shares: 4,60 € per order plus 2,10 € exchange fee, no
// venue mark-up (checked below, so the expectations stay independent of the fee functions).
const BROKER = WORLD.banks.find((bank) => bank.type === 'online-broker');
const EXCHANGE = EXCHANGES.find((exchange) => exchange.id === COMPANY.exchangeId);
if (BROKER === undefined || EXCHANGE === undefined) {
  throw new Error('The mini world lacks an online broker or the exchange of its first company');
}
const ORDER_FEE = 4.6;
const EXCHANGE_FEE = 2.1;

function hhmm(minuteOfDay: number): string {
  const pad = (value: number): string => String(value).padStart(2, '0');
  return `${pad(Math.floor(minuteOfDay / 60))}:${pad(minuteOfDay % 60)}`;
}

/** Euros rounded half away from zero to cents, independent of the money functions (TS §7.1). */
function cents(euros: number): number {
  return Math.round(Number((euros * 100).toPrecision(12))) / 100;
}

// AP 5.4 acceptance: open a depot, transfer money, buy from the instrument page with the cost
// preview, see the position, sell with the tax preview; a clear message for missing funds.
describe('InstrumentPage trading', () => {
  let engine: InProcessEngine;
  let harness: RouterTestingHarness;
  let page: HTMLElement;
  let playerId: string;
  let restorePlatform: () => void;
  let restoreViewport: () => void;

  beforeEach(async () => {
    localStorage.clear();
    restorePlatform = installChartPlatform();
    // The clock controls with the jump button need a wide header.
    restoreViewport = installViewport(1024);
    const locks = new FakePlayerLocks();
    engine = new InProcessEngine({ storage: 'indexed-db', locks });
    harness = await renderRoute('/players', [
      provideInProcessEngineWorker(engine),
      providePlayersTestPorts({ locks }),
    ]);
    page = harness.fixture.nativeElement;
    const { profile } = await firstValueFrom(TestBed.inject(PlayersService).createPlayer(ANNA));
    playerId = profile.id;
  });

  afterEach(() => {
    restoreViewport();
    restorePlatform();
  });

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

  function body<T extends HTMLElement = HTMLElement>(testId: string): T {
    return byTestId<T>(document.body, testId);
  }

  function euros(testId: string): number {
    return parseEuros(textOf(body(testId)));
  }

  function toasts(): string[] {
    // the message without the tone that only screen readers hear
    return Array.from(document.body.querySelectorAll<HTMLElement>('[data-testid^="toast."] p')).map(
      textOf,
    );
  }

  /** Jumps to `minute` of Monday 01.04.2030. */
  async function jumpTo(minute: number): Promise<void> {
    await act(() => click(byTestId(page, 'shell.header.jump-button')));
    await act(() => click(body('clock.jump-dialog.date-kind')));
    await act(() => typeText(body<HTMLInputElement>('clock.jump-dialog.date'), '2030-04-01'));
    await act(() => typeText(body<HTMLInputElement>('clock.jump-dialog.time'), hhmm(minute)));
    await act(() => click(body('clock.jump-dialog.submit')));
    await run(500);
  }

  /** Opens a depot at the broker from the hint of „Kaufen“, then transfers 3.000 € to it. */
  async function openDepotWithMoney(): Promise<void> {
    await open(`markets/${COMPANY.id}`);
    expect(textOf(byTestId(page, 'trading.trade-actions.no-depot'))).toContain('Depot');
    await act(() => click(byTestId(page, 'trading.trade-actions.buy')));
    await act(() => click(body('dialog-confirm.confirm')));
    await act(() =>
      select(body<HTMLSelectElement>('banking.open-account-dialog.bank'), BROKER!.id),
    );
    expect(queryByTestId(document.body, 'banking.open-account-dialog.kind.current')).toBeNull();
    await act(() => click(body('banking.open-account-dialog.kind.depot')));
    await act(() => click(body('banking.open-account-dialog.submit')));
    expect(toasts()).toContain('Das Depot mit Verrechnungskonto ist eröffnet.');

    await open('accounts');
    await act(() => click(byTestId(page, 'banking.accounts.transfer')));
    await act(() => select(body<HTMLSelectElement>('banking.transfer-dialog.to'), 'acc-2'));
    await act(() => typeText(body<HTMLInputElement>('banking.transfer-dialog.amount'), '3000'));
    await act(() => click(body('banking.transfer-dialog.submit')));
    await open(`markets/${COMPANY.id}`);
  }

  it('buys with the cost preview, holds the position and sells with the tax preview', async () => {
    expect(BROKER.conditions.depot).toMatchObject({
      orderFee: { kind: 'flat', amount: 460 },
      exchangeFee: 210,
      spreadMarkup: 0,
      fractionalShares: false,
    });
    await openDepotWithMoney();

    // Before the open of the share's exchange: the order waits for the open.
    await act(() => click(byTestId(page, 'trading.trade-actions.buy')));
    expect(queryByTestId(document.body, 'trading.order-ticket.market-closed')).not.toBeNull();
    expect(textOf(body('trading.order-ticket.depot'))).toContain(BROKER.name);
    await act(() => typeText(body<HTMLInputElement>('trading.order-ticket.quantity'), '10'));

    const ask = parseEuros(textOf(body('trading.order-ticket.ask')));
    expect(parseEuros(textOf(body('trading.order-ticket.price')))).toBe(ask);
    expect(textOf(body('trading.order-ticket.preview-quantity'))).toBe('10');
    const marketValue = cents(10 * ask);
    expect(euros('trading.order-ticket.market-value')).toBe(marketValue);
    expect(euros('trading.order-ticket.order-fee')).toBe(ORDER_FEE);
    expect(euros('trading.order-ticket.exchange-fee')).toBe(EXCHANGE_FEE);
    expect(euros('trading.order-ticket.total')).toBe(cents(marketValue + ORDER_FEE + EXCHANGE_FEE));
    // Market purchases reserve 5 % more than the market value (TS §7.5).
    expect(euros('trading.order-ticket.reservation')).toBe(
      cents(marketValue + cents(marketValue * 0.05) + ORDER_FEE + EXCHANGE_FEE),
    );
    expect(queryByTestId(document.body, 'trading.order-ticket.buffer-note')).not.toBeNull();
    expect(euros('trading.order-ticket.available')).toBe(3_000);
    expect(queryByTestId(document.body, 'trading.order-ticket.shortfall')).toBeNull();

    await act(() => click(body('trading.order-ticket.submit')));
    expect(queryByTestId(document.body, 'trading.order-ticket.submit')).toBeNull();
    expect(toasts()).toContain(`Kauforder für ${COMPANY.name} erteilt.`);
    expect(queryByTestId(page, 'trading.trade-actions.position')).toBeNull();

    // The order executes at the open (US-HD-03) and reports its debit.
    await jumpTo(EXCHANGE.open + 1);
    expect(textOf(byTestId(page, 'trading.trade-actions.position'))).toBe('Im Depot: 10 Stück');
    const executed = toasts().find((toast) => toast.includes('belastet'));
    expect(executed).toBeDefined();
    const debit = parseEuros(executed!.split('belastet ')[1].replace(/\.$/, ''));

    // The sale previews gain and tax (US-HD-02): the credit after costs minus the debit.
    await act(() => click(byTestId(page, 'trading.trade-actions.sell')));
    expect(textOf(body('trading.order-ticket.free'))).toBe('Frei im Depot: 10 Stück');
    await act(() => click(body('trading.order-ticket.sell-all')));
    const bid = parseEuros(textOf(body('trading.order-ticket.bid')));
    const credit = cents(cents(10 * bid) - ORDER_FEE - EXCHANGE_FEE);
    expect(euros('trading.order-ticket.total')).toBe(credit);
    expect(euros('trading.order-ticket.gain')).toBe(cents(credit - debit));
    // Spread and costs make it a loss; without taxed income before, nothing is refunded.
    expect(credit - debit).toBeLessThan(0);
    expect(euros('trading.order-ticket.tax')).toBe(0);
    expect(euros('trading.order-ticket.net')).toBe(credit);

    await act(() => click(body('trading.order-ticket.submit')));
    expect(toasts()).toContain(`Verkaufsorder für ${COMPANY.name} erteilt.`);
    await run(300);
    expect(queryByTestId(page, 'trading.trade-actions.position')).toBeNull();
    const sell = byTestId(page, 'trading.trade-actions.sell');
    expect(sell.getAttribute('aria-disabled')).toBe('true');
    expect(textOf(byTestId(page, 'trading.trade-actions.sell-reason'))).toBe(
      'Du hast dieses Wertpapier nicht im Depot.',
    );
  });

  it('names the shortfall of a purchase the clearing account does not cover', async () => {
    await openDepotWithMoney();
    await act(() => click(byTestId(page, 'trading.trade-actions.buy')));
    const quantity = body<HTMLInputElement>('trading.order-ticket.quantity');
    await act(() => typeText(quantity, '1000'));
    await act(() => quantity.dispatchEvent(new Event('blur')));

    const shortfall = euros('trading.order-ticket.shortfall');
    expect(shortfall).toBe(cents(euros('trading.order-ticket.reservation') - 3_000));
    expect(textOf(body('trading.order-ticket.quantity-error'))).toBe(
      `Das Guthaben auf dem Verrechnungskonto reicht nicht, es fehlen ${textOf(body('trading.order-ticket.shortfall'))}.`,
    );
    await act(() => click(body('trading.order-ticket.submit')));
    expect(queryByTestId(document.body, 'trading.order-ticket.submit')).not.toBeNull();
    await act(() => click(body('trading.order-ticket.decline')));
    expect(queryByTestId(document.body, 'trading.order-ticket.submit')).toBeNull();
  });

  it('offers no trading for an index', async () => {
    await open(`markets/${INDEX.id}`);
    expect(textOf(byTestId(page, 'trading.trade-actions.not-tradable'))).toBe(
      'Indizes sind nicht handelbar. Du kannst sie über einen ETF kaufen.',
    );
    expect(queryByTestId(page, 'trading.trade-actions.buy')).toBeNull();
  });
});
