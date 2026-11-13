import { Dialog } from '@angular/cdk/dialog';
import { TestBed } from '@angular/core/testing';
import { provideMockActions } from '@ngrx/effects/testing';
import { Action } from '@ngrx/store';
import { MockStore, provideMockStore } from '@ngrx/store/testing';
import { of, Subject } from 'rxjs';
import type { Mocked } from 'vitest';

import * as BankingActions from '@app/banking/feature/state/banking.actions';
import { AccountEntry } from '@app/banking/feature/state/banking.model';
import { Instrument } from '@app/market/domain/models/instrument.model';
import * as MarketActions from '@app/market/feature/state/market.actions';
import { selectInstrumentEntities } from '@app/market/feature/state/market.selectors';
import { OrderSpec } from '@app/trading/domain/models/order.model';

import { TradingDialogEffects } from './trading-dialogs.effects';
import * as TradingActions from './trading.actions';
import { DepotEntry, ORDER_TICKET_SUBSCRIPTION } from './trading.model';
import { selectDepots } from './trading.selectors';

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

describe('TradingDialogEffects', () => {
  let effects: TradingDialogEffects;
  let actions$: Subject<Action>;
  let dialog: Mocked<Pick<Dialog, 'open'>>;
  let store: MockStore;

  function closeWith(result: unknown): void {
    dialog.open.mockReturnValue({ closed: of(result) } as ReturnType<Dialog['open']>);
  }

  function emitted(action: Action): unknown[] {
    const received: unknown[] = [];
    const subscription = effects.orderTicketDialog$.subscribe((next) => received.push(next));
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
      BankingActions.clickedOpenAccount({}),
    ]);
    expect(dialog.open.mock.calls[0]?.[1]?.data).toMatchObject({ confirmLabel: 'Depot eröffnen' });
  });

  it('opens nothing for an index or an unknown instrument', () => {
    expect(emitted(TradingActions.clickedBuy({ instrumentId: INDEX.id }))).toEqual([]);
    expect(emitted(TradingActions.clickedBuy({ instrumentId: 'stk-9' }))).toEqual([]);
    expect(dialog.open).not.toHaveBeenCalled();
  });
});
