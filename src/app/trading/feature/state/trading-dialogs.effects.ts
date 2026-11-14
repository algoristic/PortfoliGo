import { Dialog } from '@angular/cdk/dialog';
import { inject, Injectable, Injector } from '@angular/core';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { concatLatestFrom } from '@ngrx/operators';
import { Action, select, Store } from '@ngrx/store';
import { concat, exhaustMap, filter, map, Observable, of } from 'rxjs';

import * as BankingActions from '@app/banking/feature/state/banking.actions';
import * as MarketActions from '@app/market/feature/state/market.actions';
import { selectInstrumentEntities } from '@app/market/feature/state/market.selectors';
import { openConfirmDialog } from '@app/shared/ui/dialog-confirm/dialog-confirm.utils';
import { formatCents } from '@app/shared/util/format';
import { OrderSide } from '@app/trading/domain/models/order.model';
import { SavingsPlanChange, SavingsPlanSpec } from '@app/trading/domain/models/savings-plan.model';
import { isActive } from '@app/trading/domain/order-reservation-logic';

import * as TradingActions from './trading.actions';
import {
  ORDER_CHANGE_SUBSCRIPTION,
  ORDER_TICKET_SUBSCRIPTION,
  SAVINGS_PLAN_SUBSCRIPTION,
} from './trading.model';
import { selectDepots, selectOrderEntities, selectSavingsPlans } from './trading.selectors';
import { preselectedDepot, savingsPlanDepot } from './trading.utils';

import { DialogChangeOrderComponent } from '../dialog-change-order/dialog-change-order.component';
import {
  ChangeOrderDialogData,
  ChangeOrderDialogResult,
} from '../dialog-change-order/dialog-change-order.model';
import { DialogOrderTicketComponent } from '../dialog-order-ticket/dialog-order-ticket.component';
import {
  OrderTicketDialogData,
  OrderTicketDialogResult,
} from '../dialog-order-ticket/dialog-order-ticket.model';
import { DialogSavingsPlanComponent } from '../dialog-savings-plan/dialog-savings-plan.component';
import {
  SavingsPlanDialogData,
  SavingsPlanDialogResult,
} from '../dialog-savings-plan/dialog-savings-plan.model';

/** What a click on „Sparplan anlegen“ leads to. */
type SavingsPlanStart =
  { kind: 'dialog'; data: SavingsPlanDialogData; series: number | null } | { kind: 'no-depot' };

/** What a click on „Kaufen“ or „Verkaufen“ leads to. */
type TicketStart =
  { kind: 'ticket'; data: OrderTicketDialogData; series: number } | { kind: 'no-depot' };

/**
 * The order ticket (AP 5.4, TS §11.4, §11.6): `clickedBuy`/`clickedSell` open it for a tradable
 * instrument with the preselected depot, watch the instrument's quote under
 * `ORDER_TICKET_SUBSCRIPTION` while it is open and turn its result into `submittedPlaceOrder`.
 * Without an open depot a hint offers „Konto eröffnen“ with the kind „Depot“ instead. In the order
 * book `clickedChangeOrder` opens „Order ändern“ for an active order (quote under
 * `ORDER_CHANGE_SUBSCRIPTION`, result → `submittedChangeOrder`) and `clickedCancelOrder` asks to
 * confirm (→ `submittedCancelOrder`). The focus goes into the first field (`cdkFocusInitial`),
 * Escape closes and the CDK returns the focus to the button.
 */
@Injectable()
export class TradingDialogEffects {
  readonly #actions$ = inject(Actions);
  readonly #dialog = inject(Dialog);
  // The ticket reads the game's slices; their facades live in the game's environment injector.
  readonly #injector = inject(Injector);
  readonly #store = inject(Store);

  orderTicketDialog$ = createEffect(() =>
    this.#actions$.pipe(
      ofType(TradingActions.clickedBuy, TradingActions.clickedSell),
      concatLatestFrom(() => [
        this.#store.pipe(select(selectInstrumentEntities)),
        this.#store.pipe(select(selectDepots)),
      ]),
      map(([action, instruments, depots]): TicketStart | null => {
        const instrument = instruments[action.instrumentId];
        if (instrument === undefined || instrument.kind === 'index') {
          return null;
        }
        const side: OrderSide = action.type === TradingActions.clickedBuy.type ? 'buy' : 'sell';
        const depotId = preselectedDepot(side, instrument.id, depots, action.depotId);
        return depotId === null
          ? { kind: 'no-depot' }
          : {
              kind: 'ticket',
              data: { instrumentId: instrument.id, side, depotId },
              series: instrument.series,
            };
      }),
      filter((start): start is TicketStart => start !== null),
      exhaustMap((start) =>
        start.kind === 'no-depot' ? this.#offerDepot() : this.#openTicket(start.data, start.series),
      ),
    ),
  );

  changeOrderDialog$ = createEffect(() =>
    this.#actions$.pipe(
      ofType(TradingActions.clickedChangeOrder),
      concatLatestFrom(() => [
        this.#store.pipe(select(selectOrderEntities)),
        this.#store.pipe(select(selectInstrumentEntities)),
      ]),
      map(([{ orderId }, orders, instruments]) => {
        const order = orders[orderId];
        const instrument = order === undefined ? undefined : instruments[order.instrumentId];
        return order === undefined || instrument === undefined || !isActive(order.status)
          ? null
          : { orderId, series: instrument.series };
      }),
      filter((start): start is { orderId: string; series: number } => start !== null),
      exhaustMap(({ orderId, series }) => this.#openChange(orderId, series)),
    ),
  );

  cancelOrderDialog$ = createEffect(() =>
    this.#actions$.pipe(
      ofType(TradingActions.clickedCancelOrder),
      concatLatestFrom(() => [
        this.#store.pipe(select(selectOrderEntities)),
        this.#store.pipe(select(selectInstrumentEntities)),
      ]),
      map(([{ orderId }, orders, instruments]) => {
        const order = orders[orderId];
        return order === undefined || !isActive(order.status)
          ? null
          : {
              orderId,
              side: order.side,
              name: instruments[order.instrumentId]?.name ?? order.instrumentId,
            };
      }),
      filter(
        (order): order is { orderId: string; side: OrderSide; name: string } => order !== null,
      ),
      exhaustMap(({ orderId, side, name }) =>
        openConfirmDialog(this.#dialog, {
          heading: $localize`:@@featureTrading-tradingDialogEffects-cancelHeading:Order stornieren?`,
          message:
            side === 'buy'
              ? $localize`:@@featureTrading-tradingDialogEffects-cancelBuyMessage:Die Kauforder für ${name}:instrument: wird storniert, ihre Reservierung auf dem Verrechnungskonto wird frei.`
              : $localize`:@@featureTrading-tradingDialogEffects-cancelSellMessage:Die Verkaufsorder für ${name}:instrument: wird storniert, ihre Stück sind wieder frei.`,
          confirmLabel: $localize`:@@featureTrading-tradingDialogEffects-cancelConfirm:Stornieren`,
          declineLabel: $localize`:@@featureTrading-tradingDialogEffects-cancelDecline:Behalten`,
          tone: 'danger',
        }).pipe(
          filter(Boolean),
          map(() => TradingActions.submittedCancelOrder({ orderId })),
        ),
      ),
    ),
  );

  /**
   * „Sparplan anlegen“ (US-HD-05): for an eligible instrument (instrument page) or with an
   * instrument to choose (depot page, order book), in the given or the first open depot; without
   * an open depot the hint „Kein Depot“. The chosen instrument's quote is watched under
   * `SAVINGS_PLAN_SUBSCRIPTION` for the preview.
   */
  createSavingsPlanDialog$ = createEffect(() =>
    this.#actions$.pipe(
      ofType(TradingActions.clickedCreateSavingsPlan),
      concatLatestFrom(() => [
        this.#store.pipe(select(selectInstrumentEntities)),
        this.#store.pipe(select(selectDepots)),
      ]),
      map(([{ instrumentId, depotId }, instruments, depots]): SavingsPlanStart | null => {
        const instrument = instrumentId === undefined ? undefined : instruments[instrumentId];
        if (instrumentId !== undefined && instrument?.savingsPlanEligible !== true) {
          return null;
        }
        const depot = savingsPlanDepot(depots, depotId);
        return depot === null
          ? { kind: 'no-depot' }
          : {
              kind: 'dialog',
              data: {
                mode: 'create',
                initial: {
                  depotId: depot,
                  instrumentId: instrumentId ?? '',
                  amount: null,
                  day: '1',
                },
              },
              series: instrument?.series ?? null,
            };
      }),
      filter((start): start is SavingsPlanStart => start !== null),
      exhaustMap((start) =>
        start.kind === 'no-depot'
          ? this.#offerDepot()
          : this.#openSavingsPlan(start.data, start.series, (result) =>
              TradingActions.submittedCreateSavingsPlan({ plan: result as SavingsPlanSpec }),
            ),
      ),
    ),
  );

  changeSavingsPlanDialog$ = createEffect(() =>
    this.#actions$.pipe(
      ofType(TradingActions.clickedChangeSavingsPlan),
      concatLatestFrom(() => [
        this.#store.pipe(select(selectSavingsPlans)),
        this.#store.pipe(select(selectInstrumentEntities)),
      ]),
      map(([{ savingsPlanId }, plans, instruments]) => {
        const plan = plans?.find((candidate) => candidate.id === savingsPlanId);
        return plan === undefined
          ? null
          : {
              savingsPlanId,
              series: instruments[plan.instrumentId]?.series ?? null,
              data: {
                mode: 'change' as const,
                initial: {
                  depotId: plan.depotId,
                  instrumentId: plan.instrumentId,
                  amount: plan.amount,
                  day: String(plan.day),
                },
              },
            };
      }),
      filter((start) => start !== null),
      exhaustMap(({ savingsPlanId, series, data }) =>
        this.#openSavingsPlan(data, series, (result) =>
          TradingActions.submittedChangeSavingsPlan({
            savingsPlanId,
            change: { amount: result.amount, day: result.day },
          }),
        ),
      ),
    ),
  );

  deleteSavingsPlanDialog$ = createEffect(() =>
    this.#actions$.pipe(
      ofType(TradingActions.clickedDeleteSavingsPlan),
      concatLatestFrom(() => [
        this.#store.pipe(select(selectSavingsPlans)),
        this.#store.pipe(select(selectInstrumentEntities)),
      ]),
      map(([{ savingsPlanId }, plans, instruments]) => {
        const plan = plans?.find((candidate) => candidate.id === savingsPlanId);
        return plan === undefined
          ? null
          : { plan, name: instruments[plan.instrumentId]?.name ?? plan.instrumentId };
      }),
      filter((target) => target !== null),
      exhaustMap(({ plan, name }) => {
        const amount = formatCents(plan.amount);
        return openConfirmDialog(this.#dialog, {
          heading: $localize`:@@featureTrading-tradingDialogEffects-deleteSavingsPlanHeading:Sparplan löschen?`,
          message: $localize`:@@featureTrading-tradingDialogEffects-deleteSavingsPlanMessage:Der Sparplan für ${name}:instrument: über ${amount}:amount: am ${plan.day}:day:. jedes Monats wird gelöscht. Gekaufte Anteile bleiben im Depot.`,
          confirmLabel: $localize`:@@featureTrading-tradingDialogEffects-deleteSavingsPlanConfirm:Löschen`,
          declineLabel: $localize`:@@featureTrading-tradingDialogEffects-deleteSavingsPlanDecline:Behalten`,
          tone: 'danger',
        }).pipe(
          filter(Boolean),
          map(() => TradingActions.submittedDeleteSavingsPlan({ savingsPlanId: plan.id })),
        );
      }),
    ),
  );

  /** The dialog chose another instrument: watch its quote for the preview. */
  savingsPlanInstrumentQuote$ = createEffect(() =>
    this.#actions$.pipe(
      ofType(TradingActions.selectedSavingsPlanInstrument),
      concatLatestFrom(() => this.#store.pipe(select(selectInstrumentEntities))),
      map(([{ instrumentId }, instruments]) => instruments[instrumentId]),
      filter((instrument) => instrument !== undefined),
      map((instrument) =>
        MarketActions.quotesSubscriptionChanged({
          key: SAVINGS_PLAN_SUBSCRIPTION,
          series: [instrument.series],
        }),
      ),
    ),
  );

  #openSavingsPlan(
    data: SavingsPlanDialogData,
    series: number | null,
    toAction: (result: SavingsPlanChange & Partial<SavingsPlanSpec>) => Action,
  ): Observable<Action> {
    const dialog$ = this.#dialog
      .open<SavingsPlanDialogResult, SavingsPlanDialogData>(DialogSavingsPlanComponent, {
        data,
        injector: this.#injector,
        ariaLabel:
          data.mode === 'create'
            ? $localize`:@@featureTrading-tradingDialogEffects-createSavingsPlanLabel:Sparplan anlegen`
            : $localize`:@@featureTrading-tradingDialogEffects-changeSavingsPlanLabel:Sparplan ändern`,
        width: '32rem',
        maxWidth: 'calc(100vw - 2rem)',
        maxHeight: 'calc(100dvh - 2rem)',
      })
      .closed.pipe(
        filter((result): result is SavingsPlanDialogResult => result !== undefined),
        map(toAction),
      );
    return concat(
      series === null
        ? of()
        : of(
            MarketActions.quotesSubscriptionChanged({
              key: SAVINGS_PLAN_SUBSCRIPTION,
              series: [series],
            }),
          ),
      dialog$,
      of(MarketActions.quotesSubscriptionEnded({ key: SAVINGS_PLAN_SUBSCRIPTION })),
    );
  }

  #openChange(orderId: string, series: number): Observable<Action> {
    const change$ = this.#dialog
      .open<ChangeOrderDialogResult, ChangeOrderDialogData>(DialogChangeOrderComponent, {
        data: { orderId },
        injector: this.#injector,
        ariaLabel: $localize`:@@featureTrading-tradingDialogEffects-changeLabel:Order ändern`,
        width: '32rem',
        maxWidth: 'calc(100vw - 2rem)',
        maxHeight: 'calc(100dvh - 2rem)',
      })
      .closed.pipe(
        filter((change): change is ChangeOrderDialogResult => change !== undefined),
        map((change) => TradingActions.submittedChangeOrder({ orderId, change })),
      );
    return concat(
      of(
        MarketActions.quotesSubscriptionChanged({
          key: ORDER_CHANGE_SUBSCRIPTION,
          series: [series],
        }),
      ),
      change$,
      of(MarketActions.quotesSubscriptionEnded({ key: ORDER_CHANGE_SUBSCRIPTION })),
    );
  }

  #openTicket(data: OrderTicketDialogData, series: number): Observable<Action> {
    const ticket$ = this.#dialog
      .open<OrderTicketDialogResult, OrderTicketDialogData>(DialogOrderTicketComponent, {
        data,
        injector: this.#injector,
        ariaLabel:
          data.side === 'buy'
            ? $localize`:@@featureTrading-tradingDialogEffects-buyLabel:Kaufen`
            : $localize`:@@featureTrading-tradingDialogEffects-sellLabel:Verkaufen`,
        width: '36rem',
        maxWidth: 'calc(100vw - 2rem)',
        maxHeight: 'calc(100dvh - 2rem)',
      })
      .closed.pipe(
        filter((order): order is OrderTicketDialogResult => order !== undefined),
        map((order) => TradingActions.submittedPlaceOrder({ order })),
      );
    return concat(
      of(
        MarketActions.quotesSubscriptionChanged({
          key: ORDER_TICKET_SUBSCRIPTION,
          series: [series],
        }),
      ),
      ticket$,
      of(MarketActions.quotesSubscriptionEnded({ key: ORDER_TICKET_SUBSCRIPTION })),
    );
  }

  #offerDepot(): Observable<Action> {
    return openConfirmDialog(this.#dialog, {
      heading: $localize`:@@featureTrading-tradingDialogEffects-noDepotHeading:Kein Depot`,
      message: $localize`:@@featureTrading-tradingDialogEffects-noDepotMessage:Zum Handeln brauchst du ein Depot mit Verrechnungskonto. Du kannst es bei jeder Bank sofort und kostenlos eröffnen und dann Geld auf das Verrechnungskonto überweisen.`,
      confirmLabel: $localize`:@@featureTrading-tradingDialogEffects-noDepotConfirm:Depot eröffnen`,
    }).pipe(
      filter(Boolean),
      map(() => BankingActions.clickedOpenAccount({ kind: 'depot' })),
    );
  }
}
