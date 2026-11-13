import { ComponentFixture, TestBed } from '@angular/core/testing';

import { DepotConditions } from '@app/banking/domain/models/bank-conditions.model';
import { Instrument } from '@app/market/domain/models/instrument.model';
import { OrderSpec } from '@app/trading/domain/models/order.model';

import { FormOrderTicketComponent } from './form-order-ticket.component';

import { byTestId, click, queryByTestId, select, textOf, typeText } from '../../../../testing/dom';
import { parseEuros } from '../../../../testing/parse';
import { OrderTicketContext } from '../models/order-ticket.model';

// Neo-broker N of TS §7.5 (0,90 € flat, fractional shares) with a mark-up of 0,12 %.
const N: DepotConditions = {
  custodyFee: { kind: 'none' },
  orderFee: { kind: 'flat', amount: 90 },
  exchangeFee: 0,
  savingsPlanFee: { kind: 'free' },
  clearingAccountRate: 0,
  clearingAccountDebitRate: 0.1,
  venue: 'market-maker',
  spreadMarkup: 0.0012,
  fractionalShares: true,
};

const CONTEXT: OrderTicketContext = {
  instrument: { id: 'stk-1', kind: 'stock', name: 'Astix', series: 0 } as Instrument,
  quote: { last: 100, bid: 99.9, ask: 100.1 },
  atPriceFloor: false,
  marketOpen: false,
  tick: 5_390_520,
  depots: [
    {
      depotId: 'dep-2',
      number: '0000000002',
      bankName: 'Helova',
      conditions: N,
      clearingBalance: 500_000,
      reserved: 0,
      position: {
        instrumentId: 'stk-1',
        quantity: 2_500_000,
        free: 2_500_000,
        cost: 25_000,
        lots: [{ buyTick: 0, quantity: 2_500_000, cost: 25_000 }],
        realizedGain: 0,
        distributions: 0,
      },
    },
  ],
  taxYear: null,
};

describe('FormOrderTicketComponent', () => {
  let fixture: ComponentFixture<FormOrderTicketComponent>;
  let submitted: OrderSpec[];
  let root: HTMLElement;

  async function render(side: 'buy' | 'sell'): Promise<void> {
    fixture = TestBed.createComponent(FormOrderTicketComponent);
    fixture.componentRef.setInput('context', CONTEXT);
    fixture.componentRef.setInput('side', side);
    fixture.componentRef.setInput('depotId', 'dep-2');
    submitted = [];
    fixture.componentInstance.submittedOrder.subscribe((order) => submitted.push(order));
    root = fixture.nativeElement;
    await fixture.whenStable();
  }

  async function act(action: () => void): Promise<void> {
    action();
    await fixture.whenStable();
  }

  function has(testId: string): boolean {
    return queryByTestId(root, testId) !== null;
  }

  it('switches between quantity and amount and shows the bank quote with its mark-up', async () => {
    await render('buy');
    // 100 × (1 ∓ (0,20 % + 0,12 %) / 2) on the grid.
    expect(parseEuros(textOf(byTestId(root, 'trading.order-ticket.ask')))).toBe(100.16);
    expect(has('trading.order-ticket.market-closed')).toBe(true);
    expect(has('trading.order-ticket.quantity')).toBe(true);
    expect(has('trading.order-ticket.amount')).toBe(false);

    await act(() => click(byTestId(root, 'trading.order-ticket.size.amount')));
    expect(has('trading.order-ticket.quantity')).toBe(false);
    await act(() =>
      typeText(byTestId<HTMLInputElement>(root, 'trading.order-ticket.amount'), '1000'),
    );
    // (1.000 − 0,90) / 100,16 = 9,975… shares in millionths, rounded down (TS §7.5).
    expect(textOf(byTestId(root, 'trading.order-ticket.preview-quantity'))).toBe('9,975039');
    expect(has('trading.order-ticket.buffer-note')).toBe(false);

    await act(() => click(byTestId(root, 'trading.order-ticket.submit')));
    expect(submitted).toEqual([
      {
        depotId: 'dep-2',
        instrumentId: 'stk-1',
        side: 'buy',
        type: 'market',
        size: { kind: 'amount', amount: 100_000 },
        limit: null,
        stop: null,
        validity: { kind: 'day' },
      },
    ]);
  });

  it('shows limit and stop fields by order type and the date for „bis Datum“', async () => {
    await render('buy');
    const fields = (): boolean[] =>
      ['limit', 'stop', 'validity-date'].map((field) => has(`trading.order-ticket.${field}`));
    expect(fields()).toEqual([false, false, false]);
    await act(() => select(byTestId(root, 'trading.order-ticket.type'), 'limit'));
    expect(fields()).toEqual([true, false, false]);
    await act(() => select(byTestId(root, 'trading.order-ticket.type'), 'stop'));
    expect(fields()).toEqual([false, true, false]);
    await act(() => select(byTestId(root, 'trading.order-ticket.type'), 'stop-limit'));
    await act(() => select(byTestId(root, 'trading.order-ticket.validity'), 'date'));
    expect(fields()).toEqual([true, true, true]);
    expect(byTestId(root, 'trading.order-ticket.validity-date').getAttribute('max')).toBe(
      '2031-04-01',
    );
  });

  it('sells all free shares, by quantity only', async () => {
    await render('sell');
    expect(has('trading.order-ticket.size.amount')).toBe(false);
    expect(textOf(byTestId(root, 'trading.order-ticket.free'))).toBe('Frei im Depot: 2,5 Stück');
    await act(() => click(byTestId(root, 'trading.order-ticket.sell-all')));
    expect(byTestId<HTMLInputElement>(root, 'trading.order-ticket.quantity').value).toBe('2,5');
    await act(() => click(byTestId(root, 'trading.order-ticket.submit')));
    expect(submitted.map((order) => [order.side, order.size])).toEqual([
      ['sell', { kind: 'quantity', quantity: 2_500_000 }],
    ]);
  });

  it('sends nothing while the form is invalid', async () => {
    await render('buy');
    await act(() => click(byTestId(root, 'trading.order-ticket.submit')));
    expect(textOf(byTestId(root, 'trading.order-ticket.quantity-error'))).toBe(
      'Bitte gib die Stückzahl ein.',
    );
    expect(submitted).toEqual([]);
  });
});
