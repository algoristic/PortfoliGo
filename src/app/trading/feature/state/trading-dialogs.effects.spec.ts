import { Dialog } from '@angular/cdk/dialog';
import { TestBed } from '@angular/core/testing';
import { provideMockActions } from '@ngrx/effects/testing';
import { Action } from '@ngrx/store';
import { MockStore, provideMockStore } from '@ngrx/store/testing';
import { of, Subject } from 'rxjs';
import type { Mocked } from 'vitest';

import * as BankingActions from '@app/banking/feature/state/banking.actions';
import { AccountEntry } from '@app/banking/feature/state/banking.model';
import { OrderView } from '@app/engine/domain/models/trading-view.model';
import { Instrument } from '@app/market/domain/models/instrument.model';
import * as MarketActions from '@app/market/feature/state/market.actions';
import { selectInstrumentEntities } from '@app/market/feature/state/market.selectors';
import { OrderSpec } from '@app/trading/domain/models/order.model';

import { TradingDialogEffects } from './trading-dialogs.effects';
import * as TradingActions from './trading.actions';
import { DepotEntry, ORDER_CHANGE_SUBSCRIPTION, ORDER_TICKET_SUBSCRIPTION } from './trading.model';
import { selectDepots, selectOrderEntities } from './trading.selectors';

const SHARE = { id: 'stk-1', kind: 'stock', name: 'Astix', series: 4 } as Instrument;
const INDEX = { id: 'idx-1', kind: 'index', name: 'Welt', series: 9 } as Instrument;

function depot(depotId: DepotEntry['depotId'], quantity: number): DepotEntry {
  return {
    depotId,
    number: '0000000002',
    bank: null,
    clearingAccount: {} as AccountEntry,
    open: true,
    positions:
      quantity === 0
        ? []
        : [
            {
              instrumentId: SHARE.id,
              quantity,
              free: quantity,
              cost: 0,
              lots: [],
              realizedGain: 0,
              distributions: 0,
            },
          ],
  };
}

const ORDER: OrderSpec = {
  depotId: 'dep-4',
  instrumentId: SHARE.id,
  side: 'sell',
  type: 'market',
  size: { kind: 'quantity', quantity: 1_000_000 },
  limit: null,
  stop: null,
  validity: { kind: 'day' },
};

const OPEN_ORDER = { ...ORDER, id: 'ord-1', side: 'buy', status: 'open' } as OrderView;

describe('TradingDialogEffects', () => {
  let effects: TradingDialogEffects;
  let actions$: Subject<Action>;
  let dialog: Mocked<Pick<Dialog, 'open'>>;
  let store: MockStore;

  function closeWith(result: unknown): void {
    dialog.open.mockReturnValue({ closed: of(result) } as ReturnType<Dialog['open']>);
  }

  function emitted(
    action: Action,
    effect:
      'orderTicketDialog$' | 'changeOrderDialog$' | 'cancelOrderDialog$' = 'orderTicketDialog$',
  ): unknown[] {
    const received: unknown[] = [];
    const subscription = effects[effect].subscribe((next) => received.push(next));
    actions$.next(action);
    subscription.unsubscribe();
    return received;
  }

  beforeEach(() => {
    actions$ = new Subject();
    dialog = { open: vi.fn() };
    TestBed.configureTestingModule({
      providers: [
        TradingDialogEffects,
        provideMockActions(() => actions$.asObservable()),
        provideMockStore(),
        { provide: Dialog, useValue: dialog },
      ],
    });
    store = TestBed.inject(MockStore);
    store.overrideSelector(selectInstrumentEntities, { [SHARE.id]: SHARE, [INDEX.id]: INDEX });
    store.overrideSelector(selectDepots, [depot('dep-2', 0), depot('dep-4', 3_000_000)]);
    store.overrideSelector(selectOrderEntities, {
      'ord-1': OPEN_ORDER,
      'ord-2': { ...OPEN_ORDER, id: 'ord-2', status: 'executed' },
    });
    effects = TestBed.inject(TradingDialogEffects);
  });

  it('watches the quote while the ticket is open and places its order', () => {
    closeWith(ORDER);
    expect(emitted(TradingActions.clickedSell({ instrumentId: SHARE.id }))).toEqual([
      MarketActions.quotesSubscriptionChanged({ key: ORDER_TICKET_SUBSCRIPTION, series: [4] }),
      TradingActions.submittedPlaceOrder({ order: ORDER }),
      MarketActions.quotesSubscriptionEnded({ key: ORDER_TICKET_SUBSCRIPTION }),
    ]);
    // A sale starts in the depot that holds the shares.
    expect(dialog.open.mock.calls[0]?.[1]?.data).toEqual({
      instrumentId: SHARE.id,
      side: 'sell',
      depotId: 'dep-4',
    });
  });

  it('places nothing when the ticket is closed without ordering', () => {
    closeWith(undefined);
    expect(emitted(TradingActions.clickedBuy({ instrumentId: SHARE.id }))).toEqual([
      MarketActions.quotesSubscriptionChanged({ key: ORDER_TICKET_SUBSCRIPTION, series: [4] }),
      MarketActions.quotesSubscriptionEnded({ key: ORDER_TICKET_SUBSCRIPTION }),
    ]);
    expect(dialog.open.mock.calls[0]?.[1]?.data).toMatchObject({ side: 'buy', depotId: 'dep-2' });
  });

  it('offers to open a depot when there is none', () => {
    store.overrideSelector(selectDepots, []);
    store.refreshState();
    closeWith(true);
    expect(emitted(TradingActions.clickedBuy({ instrumentId: SHARE.id }))).toEqual([
      BankingActions.clickedOpenAccount({ kind: 'depot' }),
    ]);
    expect(dialog.open.mock.calls[0]?.[1]?.data).toMatchObject({ confirmLabel: 'Depot eröffnen' });
  });

  it('opens nothing for an index or an unknown instrument', () => {
    expect(emitted(TradingActions.clickedBuy({ instrumentId: INDEX.id }))).toEqual([]);
    expect(emitted(TradingActions.clickedBuy({ instrumentId: 'stk-9' }))).toEqual([]);
    expect(dialog.open).not.toHaveBeenCalled();
  });

  describe('changeOrderDialog$', () => {
    it('watches the quote while the dialog is open and sends the change', () => {
      closeWith({ limit: 101 });
      expect(
        emitted(TradingActions.clickedChangeOrder({ orderId: 'ord-1' }), 'changeOrderDialog$'),
      ).toEqual([
        MarketActions.quotesSubscriptionChanged({ key: ORDER_CHANGE_SUBSCRIPTION, series: [4] }),
        TradingActions.submittedChangeOrder({ orderId: 'ord-1', change: { limit: 101 } }),
        MarketActions.quotesSubscriptionEnded({ key: ORDER_CHANGE_SUBSCRIPTION }),
      ]);
      expect(dialog.open.mock.calls[0]?.[1]?.data).toEqual({ orderId: 'ord-1' });
    });

    it('sends nothing when the dialog is closed without a change', () => {
      closeWith(undefined);
      expect(
        emitted(TradingActions.clickedChangeOrder({ orderId: 'ord-1' }), 'changeOrderDialog$'),
      ).toEqual([
        MarketActions.quotesSubscriptionChanged({ key: ORDER_CHANGE_SUBSCRIPTION, series: [4] }),
        MarketActions.quotesSubscriptionEnded({ key: ORDER_CHANGE_SUBSCRIPTION }),
      ]);
    });

    it.each(['ord-2', 'ord-9'])('opens nothing for the closed or unknown order %s', (orderId) => {
      expect(emitted(TradingActions.clickedChangeOrder({ orderId }), 'changeOrderDialog$')).toEqual(
        [],
      );
      expect(dialog.open).not.toHaveBeenCalled();
    });
  });

  describe('cancelOrderDialog$', () => {
    it('cancels the order once the user confirms', () => {
      closeWith(true);
      expect(
        emitted(TradingActions.clickedCancelOrder({ orderId: 'ord-1' }), 'cancelOrderDialog$'),
      ).toEqual([TradingActions.submittedCancelOrder({ orderId: 'ord-1' })]);
      expect(dialog.open.mock.calls[0]?.[1]?.data).toMatchObject({
        message:
          'Die Kauforder für Astix wird storniert, ihre Reservierung auf dem Verrechnungskonto wird frei.',
        confirmLabel: 'Stornieren',
      });
    });

    it('keeps the order when the user declines', () => {
      closeWith(false);
      expect(
        emitted(TradingActions.clickedCancelOrder({ orderId: 'ord-1' }), 'cancelOrderDialog$'),
      ).toEqual([]);
    });

    it('asks nothing for an order that is no longer active', () => {
      expect(
        emitted(TradingActions.clickedCancelOrder({ orderId: 'ord-2' }), 'cancelOrderDialog$'),
      ).toEqual([]);
      expect(dialog.open).not.toHaveBeenCalled();
    });
  });
});
