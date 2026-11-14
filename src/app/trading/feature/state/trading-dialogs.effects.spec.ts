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
import { SavingsPlanView } from '@app/trading/domain/models/savings-plan.model';

import { TradingDialogEffects } from './trading-dialogs.effects';
import * as TradingActions from './trading.actions';
import {
  DepotEntry,
  ORDER_CHANGE_SUBSCRIPTION,
  ORDER_TICKET_SUBSCRIPTION,
  SAVINGS_PLAN_SUBSCRIPTION,
} from './trading.model';
import { selectDepots, selectOrderEntities, selectSavingsPlans } from './trading.selectors';

const SHARE = {
  id: 'stk-1',
  kind: 'stock',
  name: 'Astix',
  series: 4,
  savingsPlanEligible: true,
} as Instrument;
const SMALL = {
  id: 'stk-2',
  kind: 'stock',
  name: 'Klein AG',
  series: 5,
  savingsPlanEligible: false,
} as Instrument;
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

const PLAN: SavingsPlanView = {
  id: 'sp-1',
  depotId: 'dep-4',
  instrumentId: SHARE.id,
  amount: 5_000,
  day: 15,
  createdAt: 0,
  paused: false,
  handledUpTo: '2030-03',
  nextExecution: 99,
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
      | 'orderTicketDialog$'
      | 'changeOrderDialog$'
      | 'cancelOrderDialog$'
      | 'createSavingsPlanDialog$'
      | 'changeSavingsPlanDialog$'
      | 'savingsPlanInstrumentQuote$' = 'orderTicketDialog$',
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
    store.overrideSelector(selectInstrumentEntities, {
      [SHARE.id]: SHARE,
      [SMALL.id]: SMALL,
      [INDEX.id]: INDEX,
    });
    store.overrideSelector(selectSavingsPlans, [PLAN]);
    store.overrideSelector(selectDepots, [depot('dep-2', 0), depot('dep-4', 3_000_000)]);
    store.overrideSelector(selectOrderEntities, {
      'ord-1': OPEN_ORDER,
      'ord-2': { ...OPEN_ORDER, id: 'ord-2', status: 'executed' },
    });
    effects = TestBed.inject(TradingDialogEffects);
  });

  afterEach(() => {
    store.resetSelectors();
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

  describe('savings plans (AP 5.6b)', () => {
    it('opens „Sparplan anlegen“ for an eligible instrument in the given depot and watches its quote', () => {
      const plan = { depotId: 'dep-4', instrumentId: SHARE.id, amount: 5_000, day: 15 } as const;
      closeWith(plan);
      expect(
        emitted(
          TradingActions.clickedCreateSavingsPlan({ instrumentId: SHARE.id, depotId: 'dep-4' }),
          'createSavingsPlanDialog$',
        ),
      ).toEqual([
        MarketActions.quotesSubscriptionChanged({ key: SAVINGS_PLAN_SUBSCRIPTION, series: [4] }),
        TradingActions.submittedCreateSavingsPlan({ plan }),
        MarketActions.quotesSubscriptionEnded({ key: SAVINGS_PLAN_SUBSCRIPTION }),
      ]);
      expect(dialog.open.mock.calls[0][1]?.data).toEqual({
        mode: 'create',
        initial: { depotId: 'dep-4', instrumentId: SHARE.id, amount: null, day: '1' },
      });
    });

    it('opens no dialog for an instrument without savings plans', () => {
      expect(
        emitted(
          TradingActions.clickedCreateSavingsPlan({ instrumentId: SMALL.id }),
          'createSavingsPlanDialog$',
        ),
      ).toEqual([]);
      expect(dialog.open).not.toHaveBeenCalled();
    });

    it('lets the depot page choose the instrument, without a quote until one is chosen', () => {
      closeWith(undefined);
      expect(
        emitted(TradingActions.clickedCreateSavingsPlan({}), 'createSavingsPlanDialog$'),
      ).toEqual([MarketActions.quotesSubscriptionEnded({ key: SAVINGS_PLAN_SUBSCRIPTION })]);
      expect(dialog.open.mock.calls[0][1]?.data).toMatchObject({
        initial: { depotId: 'dep-2', instrumentId: '' },
      });
      expect(
        emitted(
          TradingActions.selectedSavingsPlanInstrument({ instrumentId: SHARE.id }),
          'savingsPlanInstrumentQuote$',
        ),
      ).toEqual([
        MarketActions.quotesSubscriptionChanged({ key: SAVINGS_PLAN_SUBSCRIPTION, series: [4] }),
      ]);
    });

    it('offers a depot when there is none', () => {
      store.overrideSelector(selectDepots, []);
      store.refreshState();
      closeWith(true);
      expect(
        emitted(
          TradingActions.clickedCreateSavingsPlan({ instrumentId: SHARE.id }),
          'createSavingsPlanDialog$',
        ),
      ).toEqual([BankingActions.clickedOpenAccount({ kind: 'depot' })]);
    });

    it('changes amount and day of a plan with its values preselected', () => {
      closeWith({ amount: 7_500, day: 3 });
      expect(
        emitted(
          TradingActions.clickedChangeSavingsPlan({ savingsPlanId: 'sp-1' }),
          'changeSavingsPlanDialog$',
        ),
      ).toEqual([
        MarketActions.quotesSubscriptionChanged({ key: SAVINGS_PLAN_SUBSCRIPTION, series: [4] }),
        TradingActions.submittedChangeSavingsPlan({
          savingsPlanId: 'sp-1',
          change: { amount: 7_500, day: 3 },
        }),
        MarketActions.quotesSubscriptionEnded({ key: SAVINGS_PLAN_SUBSCRIPTION }),
      ]);
      expect(dialog.open.mock.calls[0][1]?.data).toEqual({
        mode: 'change',
        initial: { depotId: 'dep-4', instrumentId: SHARE.id, amount: 5_000, day: '15' },
      });
    });
  });
});
