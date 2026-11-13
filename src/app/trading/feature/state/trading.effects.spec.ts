import { TestBed } from '@angular/core/testing';
import { provideMockActions } from '@ngrx/effects/testing';
import { Action } from '@ngrx/store';
import { MockStore, provideMockStore } from '@ngrx/store/testing';
import { firstValueFrom, of, Subject, take, throwError, toArray } from 'rxjs';
import type { Mocked } from 'vitest';

import { TradingProjectionUpdate } from '@app/engine/data-access/service/engine-service.model';
import { EngineCommandError, EngineService } from '@app/engine/data-access/service/engine.service';
import * as SessionActions from '@app/engine/feature/state/session.actions';
import { Instrument } from '@app/market/domain/models/instrument.model';
import { selectInstrumentEntities } from '@app/market/feature/state/market.selectors';
import { PlayerProfile } from '@app/players/domain/models/player.model';
import { ToastService } from '@app/shared/ui/toast/toast.service';
import { OrderSpec } from '@app/trading/domain/models/order.model';

import * as TradingActions from './trading.actions';
import { TradingEffects } from './trading.effects';

const ORDER: OrderSpec = {
  depotId: 'dep-2',
  instrumentId: 'stk-1',
  side: 'buy',
  type: 'market',
  size: { kind: 'quantity', quantity: 1_000_000 },
  limit: null,
  stop: null,
  validity: { kind: 'day' },
};

function trading(tick: number, full: boolean): TradingProjectionUpdate {
  return { tick, full, orders: [], depots: [] };
}

describe('TradingEffects', () => {
  let effects: TradingEffects;
  let actions$: Subject<Action>;
  let trading$: Subject<TradingProjectionUpdate>;
  let engine: Mocked<Pick<EngineService, 'trading$' | 'placeOrder' | 'cancelOrder'>>;
  let toasts: Mocked<Pick<ToastService, 'success' | 'error'>>;

  beforeEach(() => {
    actions$ = new Subject();
    trading$ = new Subject();
    engine = { trading$: trading$.asObservable(), placeOrder: vi.fn(), cancelOrder: vi.fn() };
    toasts = { success: vi.fn(), error: vi.fn() };
    TestBed.configureTestingModule({
      providers: [
        TradingEffects,
        provideMockActions(() => actions$.asObservable()),
        provideMockStore(),
        { provide: EngineService, useValue: engine },
        { provide: ToastService, useValue: toasts },
      ],
    });
    TestBed.inject(MockStore).overrideSelector(selectInstrumentEntities, {
      'stk-1': { id: 'stk-1', name: 'Astix' } as Instrument,
    });
    effects = TestBed.inject(TradingEffects);
  });

  describe('watchTrading$', () => {
    it('takes the last full trading part before the reply to loadPlayer and every one after it', async () => {
      const profile = { id: 'p-b' } as PlayerProfile;
      const result = firstValueFrom(effects.watchTrading$.pipe(take(3), toArray()));
      actions$.next(SessionActions.enterGame({ profile }));
      trading$.next(trading(1, true));
      trading$.next(trading(2, true));
      trading$.next(trading(3, false));
      actions$.next(SessionActions.loadPlayerSuccess({ loaded: { playerId: 'p-a', tick: 3 } }));
      actions$.next(SessionActions.loadPlayerSuccess({ loaded: { playerId: 'p-b', tick: 3 } }));
      trading$.next(trading(4, false));
      trading$.next(trading(5, true));
      expect(await result).toEqual([
        TradingActions.receivedTrading({ trading: trading(2, true) }),
        TradingActions.receivedTrading({ trading: trading(4, false) }),
        TradingActions.receivedTrading({ trading: trading(5, true) }),
      ]);
    });

    it('drops the trading parts after the game was left', () => {
      const received: Action[] = [];
      const subscription = effects.watchTrading$.subscribe((action) => received.push(action));
      actions$.next(SessionActions.enterGame({ profile: { id: 'p-a' } as PlayerProfile }));
      actions$.next(SessionActions.loadPlayerSuccess({ loaded: { playerId: 'p-a', tick: 1 } }));
      trading$.next(trading(1, false));
      actions$.next(SessionActions.leaveGame());
      trading$.next(trading(2, false));
      subscription.unsubscribe();
      expect(received).toEqual([TradingActions.receivedTrading({ trading: trading(1, false) })]);
    });
  });

  describe('placeOrder$', () => {
    it('answers with the new order ID', async () => {
      engine.placeOrder.mockReturnValue(of({ tick: 9, orderId: 'ord-3' }));
      const result = firstValueFrom(effects.placeOrder$);
      actions$.next(TradingActions.submittedPlaceOrder({ order: ORDER }));
      expect(await result).toEqual(
        TradingActions.placeOrderSuccess({ order: ORDER, orderId: 'ord-3', tick: 9 }),
      );
      expect(engine.placeOrder).toHaveBeenCalledWith(ORDER);
    });

    it('keeps the refused order with the error', async () => {
      const error = new EngineCommandError('insufficient-funds');
      engine.placeOrder.mockReturnValue(throwError(() => error));
      const result = firstValueFrom(effects.placeOrder$);
      actions$.next(TradingActions.submittedPlaceOrder({ order: ORDER }));
      expect(await result).toEqual(TradingActions.placeOrderFailure({ order: ORDER, error }));
    });
  });

  it('cancels an order and reports a refusal', async () => {
    engine.cancelOrder.mockReturnValue(
      throwError(() => new EngineCommandError('order-not-active')),
    );
    const result = firstValueFrom(effects.cancelOrder$);
    actions$.next(TradingActions.submittedCancelOrder({ orderId: 'ord-1' }));
    const failure = await result;
    expect(failure.type).toBe(TradingActions.cancelOrderFailure.type);

    const subscription = effects.showFailure$.subscribe();
    actions$.next(failure);
    subscription.unsubscribe();
    expect(toasts.error).toHaveBeenCalledWith('Die Order ist nicht mehr offen.');
  });

  it('confirms a placed order with the instrument name', () => {
    const subscription = effects.showSuccess$.subscribe();
    actions$.next(TradingActions.placeOrderSuccess({ order: ORDER, orderId: 'ord-1', tick: 1 }));
    actions$.next(
      TradingActions.placeOrderSuccess({
        order: { ...ORDER, side: 'sell' },
        orderId: 'ord-2',
        tick: 1,
      }),
    );
    subscription.unsubscribe();
    expect(toasts.success.mock.calls).toEqual([
      ['Kauforder für Astix erteilt.'],
      ['Verkaufsorder für Astix erteilt.'],
    ]);
  });
});
