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
// An online broker without fractional shares: 4,60 € per order plus 2,10 € exchange fee, no venue
// mark-up (checked below, so the expectations stay independent of the fee functions).
const BROKER = WORLD.banks.find((bank) => bank.type === 'online-broker');
const EXCHANGE = EXCHANGES.find((exchange) => exchange.id === COMPANY.exchangeId);
if (BROKER === undefined || EXCHANGE === undefined) {
  throw new Error('The mini world lacks an online broker or the exchange of its first company');
}
const COSTS = 6.7; // 4,60 € order fee + 2,10 € exchange fee
// Savings plans (AP 5.6b): an ETF, always eligible, and a share that is not.
const ETF = WORLD.etfs[0];
const ETF_EXCHANGE = EXCHANGES.find((exchange) => exchange.id === ETF.exchangeId);
const SMALL = WORLD.companies.find((company) => !company.savingsPlanEligible);
if (ETF_EXCHANGE === undefined || SMALL === undefined) {
  throw new Error('The mini world lacks the exchange of its first ETF or a small share');
}

function hhmm(minuteOfDay: number): string {
  const pad = (value: number): string => String(value).padStart(2, '0');
  return `${pad(Math.floor(minuteOfDay / 60))}:${pad(minuteOfDay % 60)}`;
}

/** Euros rounded half away from zero to cents, independent of the money functions (TS §7.1). */
function cents(euros: number): number {
  return Math.round(Number((euros * 100).toPrecision(12))) / 100;
}

// AP 5.4 acceptance: change and cancel an order from the order book (US-HD-04), the reservation
// follows; the history shows executions with price and costs.
describe('OrdersPage', () => {
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

  function text(root: ParentNode, testId: string): string {
    return textOf(byTestId(root, testId));
  }

  function toasts(): string[] {
    return Array.from(document.body.querySelectorAll<HTMLElement>('[data-testid^="toast."]'))
      .filter((toast) => !toast.dataset['testid']?.endsWith('.dismiss'))
      .map((toast) => textOf(toast));
  }

  function openRows(): HTMLElement[] {
    return Array.from(
      page.querySelectorAll<HTMLElement>('[data-testid="trading.open-orders.row"]'),
    );
  }

  /** Opens a depot at the broker from the hint of „Kaufen“, then transfers 3.000 € to it. */
  async function openDepotWithMoney(): Promise<void> {
    await open(`markets/${COMPANY.id}`);
    await act(() => click(byTestId(page, 'trading.trade-actions.buy')));
    await act(() => click(body('dialog-confirm.confirm')));
    // The hint preselects the kind „Depot“.
    expect(body<HTMLInputElement>('banking.open-account-dialog.kind.depot').checked).toBe(true);
    await act(() =>
      select(body<HTMLSelectElement>('banking.open-account-dialog.bank'), BROKER!.id),
    );
    expect(body<HTMLInputElement>('banking.open-account-dialog.kind.depot').checked).toBe(true);
    await act(() => click(body('banking.open-account-dialog.submit')));

    await open('accounts');
    await act(() => click(byTestId(page, 'banking.accounts.transfer')));
    await act(() => select(body<HTMLSelectElement>('banking.transfer-dialog.to'), 'acc-2'));
    await act(() => typeText(body<HTMLInputElement>('banking.transfer-dialog.amount'), '3000'));
    await act(() => click(body('banking.transfer-dialog.submit')));
    await open(`markets/${COMPANY.id}`);
  }

  /** Buys 10 shares from the instrument page, at a limit when given. */
  async function buyTen(limit?: string): Promise<number> {
    await act(() => click(byTestId(page, 'trading.trade-actions.buy')));
    await act(() => typeText(body<HTMLInputElement>('trading.order-ticket.quantity'), '10'));
    const ask = parseEuros(text(document.body, 'trading.order-ticket.ask'));
    if (limit !== undefined) {
      await act(() => select(body<HTMLSelectElement>('trading.order-ticket.type'), 'limit'));
      await act(() => typeText(body<HTMLInputElement>('trading.order-ticket.limit'), limit));
      await act(() => select(body<HTMLSelectElement>('trading.order-ticket.validity'), 'gtc'));
    }
    await act(() => click(body('trading.order-ticket.submit')));
    expect(toasts()).toContain(`Kauforder für ${COMPANY.name} erteilt.`);
    return ask;
  }

  it('shows empty lists without orders', async () => {
    await open('orders');
    expect(queryByTestId(page, 'trading.open-orders.empty')).not.toBeNull();
    expect(queryByTestId(page, 'trading.open-orders.reservations')).toBeNull();
    await act(() => click(byTestId(page, 'trading.orders.tabs.history.tab')));
    expect(queryByTestId(page, 'trading.order-history.empty')).not.toBeNull();
  });

  it('changes the limit of an open order and cancels it', async () => {
    expect(BROKER.conditions.depot).toMatchObject({
      orderFee: { kind: 'flat', amount: 460 },
      exchangeFee: 210,
      spreadMarkup: 0,
    });
    await openDepotWithMoney();
    // Far below the ask, so the order stays open.
    const ask = await buyTen('1');
    expect(ask).toBeGreaterThan(2);

    await open('orders');
    expect(openRows()).toHaveLength(1);
    const [row] = openRows();
    expect(text(row, 'trading.open-orders.row.name')).toBe(COMPANY.name);
    expect(text(row, 'trading.open-orders.row.depot')).toContain(BROKER.name);
    expect(text(row, 'trading.open-orders.row.side')).toBe('Kauf');
    expect(text(row, 'trading.open-orders.row.status')).toBe('Offen');
    expect(text(row, 'trading.open-orders.row.type')).toBe('Limit');
    expect(parseEuros(text(row, 'trading.open-orders.row.limit'))).toBe(1);
    expect(text(row, 'trading.open-orders.row.size')).toBe('10 Stück');
    // Good till cancelled: a year from Monday 01.04.2030.
    expect(text(row, 'trading.open-orders.row.expires')).toContain('2031');
    // A limit purchase reserves limit × shares plus costs (TS §7.5).
    expect(parseEuros(text(row, 'trading.open-orders.row.reserved'))).toBe(cents(10 + COSTS));
    expect(parseEuros(text(page, 'trading.open-orders.reservation.reserved'))).toBe(
      cents(10 + COSTS),
    );
    expect(parseEuros(text(page, 'trading.open-orders.reservation.available'))).toBe(
      cents(3_000 - 10 - COSTS),
    );

    await act(() => click(byTestId(row, 'trading.open-orders.row.change')));
    const limit = body<HTMLInputElement>('trading.change-order.limit');
    expect(limit.value).toBe('1,00');
    await act(() => typeText(limit, '2'));
    expect(parseEuros(text(document.body, 'trading.change-order.reserved'))).toBe(
      cents(10 + COSTS),
    );
    expect(parseEuros(text(document.body, 'trading.change-order.new-reservation'))).toBe(
      cents(20 + COSTS),
    );
    await act(() => click(body('trading.change-order.submit')));
    expect(queryByTestId(document.body, 'trading.change-order.submit')).toBeNull();
    expect(toasts()).toContain('Die Order ist geändert.');
    const [changed] = openRows();
    expect(parseEuros(text(changed, 'trading.open-orders.row.limit'))).toBe(2);
    expect(parseEuros(text(changed, 'trading.open-orders.row.reserved'))).toBe(cents(20 + COSTS));
    expect(parseEuros(text(page, 'trading.open-orders.reservation.available'))).toBe(
      cents(3_000 - 20 - COSTS),
    );

    // Declining keeps the order, confirming cancels it and frees the reservation.
    await act(() => click(byTestId(changed, 'trading.open-orders.row.cancel')));
    expect(text(document.body, 'dialog-confirm.confirm')).toBe('Stornieren');
    await act(() => click(body('dialog-confirm.decline')));
    expect(openRows()).toHaveLength(1);
    await act(() => click(byTestId(openRows()[0], 'trading.open-orders.row.cancel')));
    await act(() => click(body('dialog-confirm.confirm')));
    expect(toasts()).toContain('Die Order ist storniert.');
    expect(openRows()).toHaveLength(0);
    expect(queryByTestId(page, 'trading.open-orders.empty')).not.toBeNull();
    expect(queryByTestId(page, 'trading.open-orders.reservations')).toBeNull();

    await act(() => click(byTestId(page, 'trading.orders.tabs.history.tab')));
    const history = byTestId(page, 'trading.order-history.row');
    expect(text(history, 'trading.order-history.row.status')).toBe('Storniert');
    expect(text(history, 'trading.order-history.row.closed')).toContain('01.04.2030');
    expect(queryByTestId(history, 'trading.order-history.row.executed')).toBeNull();
  });

  it('shows an executed order with price, costs and total in the history', async () => {
    await openDepotWithMoney();
    await buyTen();
    await act(() => click(byTestId(page, 'shell.header.jump-button')));
    await act(() => click(body('clock.jump-dialog.date-kind')));
    await act(() => typeText(body<HTMLInputElement>('clock.jump-dialog.date'), '2030-04-01'));
    await act(() =>
      typeText(body<HTMLInputElement>('clock.jump-dialog.time'), hhmm(EXCHANGE.open + 1)),
    );
    await act(() => click(body('clock.jump-dialog.submit')));
    await run(500);

    await open('orders');
    expect(queryByTestId(page, 'trading.open-orders.empty')).not.toBeNull();
    await act(() => click(byTestId(page, 'trading.orders.tabs.history.tab')));
    const row = byTestId(page, 'trading.order-history.row');
    expect(text(row, 'trading.order-history.row.status')).toBe('Ausgeführt');
    expect(text(row, 'trading.order-history.row.type')).toBe('Market (bestens/billigst)');
    expect(text(row, 'trading.order-history.row.closed')).toBe(
      `Mo., 01.04.2030, ${hhmm(EXCHANGE.open)}`,
    );
    const executed = text(row, 'trading.order-history.row.executed');
    expect(executed).toMatch(/^10 Stück zu /);
    const price = parseEuros(executed.replace('10 Stück zu ', ''));
    expect(parseEuros(text(row, 'trading.order-history.row.costs'))).toBe(COSTS);
    expect(parseEuros(text(row, 'trading.order-history.row.total'))).toBe(
      cents(cents(10 * price) + COSTS),
    );
  });

  // AP 5.6b acceptance: create, change, pause and delete a savings plan (US-HD-05); it executes
  // after a jump past its day and shows up as a position and a notification.
  it('creates, changes, pauses, resumes and deletes a savings plan that buys after a jump', async () => {
    const fee = BROKER.conditions.depot.savingsPlanFee;
    // Online brokers charge a flat amount or nothing (TS §5.7); checked, so the costs stay literal.
    expect(['flat', 'free']).toContain(fee.kind);
    const costs = fee.kind === 'flat' ? fee.amount / 100 : 0;
    await openDepotWithMoney();

    // A share without savings plans keeps the button with its reason.
    await open(`markets/${SMALL.id}`);
    const blocked = byTestId(page, 'trading.trade-actions.savings-plan');
    expect(blocked.getAttribute('aria-disabled')).toBe('true');
    expect(text(page, 'trading.trade-actions.savings-plan-reason')).toContain(
      'Für dieses Wertpapier gibt es keinen Sparplan.',
    );
    await act(() => click(blocked));
    expect(queryByTestId(document.body, 'trading.savings-plan-dialog.submit')).toBeNull();

    // From the ETF's page, with the ETF and the depot preselected.
    await open(`markets/${ETF.id}`);
    await act(() => click(byTestId(page, 'trading.trade-actions.savings-plan')));
    expect(body<HTMLSelectElement>('trading.savings-plan-dialog.instrument').value).toBe(ETF.id);
    expect(body<HTMLSelectElement>('trading.savings-plan-dialog.depot').value).toBe('dep-3');
    await act(() => typeText(body<HTMLInputElement>('trading.savings-plan-dialog.amount'), '100'));
    await act(() => select(body<HTMLSelectElement>('trading.savings-plan-dialog.day'), '2'));
    await run(300);
    expect(parseEuros(text(document.body, 'trading.savings-plan-dialog.costs'))).toBe(costs);
    // TS §7.8: shares = (amount − costs) / ask on millionths, here from the shown ask.
    const preview = text(document.body, 'trading.savings-plan-dialog.quantity');
    const [, shown, askText] = /^ca\. (\S+) zu (.+)$/.exec(preview) ?? [];
    const ask = BigInt(Math.round(parseEuros(askText) * 10_000));
    const budget = BigInt(Math.round((100 - costs) * 100)) * 100_000_000n;
    expect(Math.round(parseEuros(shown) * 1_000_000)).toBe(Number(budget / ask));
    // 3.000 € cover the amount: no hint to a standing order.
    expect(queryByTestId(document.body, 'trading.savings-plan-dialog.inflow-hint')).toBeNull();
    await act(() => typeText(body<HTMLInputElement>('trading.savings-plan-dialog.amount'), '5000'));
    expect(queryByTestId(document.body, 'trading.savings-plan-dialog.inflow-hint')).not.toBeNull();
    await act(() => typeText(body<HTMLInputElement>('trading.savings-plan-dialog.amount'), '100'));
    await act(() => click(body('trading.savings-plan-dialog.submit')));
    expect(queryByTestId(document.body, 'trading.savings-plan-dialog.submit')).toBeNull();
    expect(toasts()).toContain(`Sparplan für ${ETF.name} angelegt.`);

    await open('orders');
    await act(() => click(byTestId(page, 'trading.orders.tabs.savings-plans.tab')));
    const plan = (): HTMLElement => byTestId(page, 'trading.savings-plans.sp-1');
    const planText = (field: string): string => text(plan(), `trading.savings-plans.${field}`);
    expect(planText('instrument')).toBe(ETF.name);
    expect(planText('amount')).toBe('100,00 € monatlich am 2.');
    expect(planText('depot')).toContain(BROKER.name);
    // Created on Monday, 01.04.2030: first at the open on Tuesday, 02.04.
    const firstOpen = `Di., 02.04.2030, ${hhmm(ETF_EXCHANGE.open)}`;
    expect(planText('next')).toBe(firstOpen);

    await act(() => click(byTestId(page, 'trading.savings-plans.sp-1.change')));
    expect(body<HTMLSelectElement>('trading.savings-plan-dialog.instrument').disabled).toBe(true);
    expect(body<HTMLSelectElement>('trading.savings-plan-dialog.day').value).toBe('2');
    await act(() => typeText(body<HTMLInputElement>('trading.savings-plan-dialog.amount'), '150'));
    await act(() => click(body('trading.savings-plan-dialog.submit')));
    await run(100);
    expect(toasts()).toContain('Der Sparplan ist geändert.');
    expect(planText('amount')).toBe('150,00 € monatlich am 2.');

    await act(() => click(byTestId(page, 'trading.savings-plans.sp-1.pause')));
    await run(100);
    expect(queryByTestId(plan(), 'trading.savings-plans.paused')).not.toBeNull();
    expect(planText('next')).toBe('keine, pausiert');
    await act(() => click(byTestId(page, 'trading.savings-plans.sp-1.resume')));
    await run(100);
    expect(queryByTestId(plan(), 'trading.savings-plans.paused')).toBeNull();
    expect(planText('next')).toBe(firstOpen);

    // Past the execution at the open on Tuesday, 02.04.2030.
    await act(() => click(byTestId(page, 'shell.header.jump-button')));
    await act(() => click(body('clock.jump-dialog.date-kind')));
    await act(() => typeText(body<HTMLInputElement>('clock.jump-dialog.date'), '2030-04-02'));
    await act(() =>
      typeText(body<HTMLInputElement>('clock.jump-dialog.time'), hhmm(ETF_EXCHANGE.open + 1)),
    );
    await act(() => click(body('clock.jump-dialog.submit')));
    await run(500);
    // Thursday, 02.05.2030.
    expect(planText('next')).toBe(`Do., 02.05.2030, ${hhmm(ETF_EXCHANGE.open)}`);

    await open('portfolio');
    expect(text(page, 'portfolio.positions')).toContain(ETF.name);
    expect(text(page, 'portfolio.savings-plans')).toContain(ETF.name);
    await open('notifications');
    expect(textOf(page)).toContain('Sparplan ausgeführt');
    expect(textOf(page)).toContain(`Stück ${ETF.name} zu`);

    // Deleting asks first; the position stays.
    await open('portfolio');
    await act(() => click(byTestId(page, 'trading.savings-plans.sp-1.delete')));
    expect(text(document.body, 'dialog-confirm.confirm')).toBe('Löschen');
    await act(() => click(body('dialog-confirm.decline')));
    expect(queryByTestId(page, 'trading.savings-plans.sp-1')).not.toBeNull();
    await act(() => click(byTestId(page, 'trading.savings-plans.sp-1.delete')));
    await act(() => click(body('dialog-confirm.confirm')));
    await run(100);
    expect(toasts()).toContain('Der Sparplan ist gelöscht.');
    expect(queryByTestId(page, 'trading.savings-plans.sp-1')).toBeNull();
    expect(queryByTestId(page, 'portfolio.savings-plans.empty')).not.toBeNull();
    expect(text(page, 'portfolio.positions')).toContain(ETF.name);
  });
});
