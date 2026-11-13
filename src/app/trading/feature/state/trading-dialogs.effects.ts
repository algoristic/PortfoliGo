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
import { OrderSide } from '@app/trading/domain/models/order.model';

import * as TradingActions from './trading.actions';
import { ORDER_TICKET_SUBSCRIPTION } from './trading.model';
import { selectDepots } from './trading.selectors';
import { preselectedDepot } from './trading.utils';

import { DialogOrderTicketComponent } from '../dialog-order-ticket/dialog-order-ticket.component';
import {
  OrderTicketDialogData,
  OrderTicketDialogResult,
} from '../dialog-order-ticket/dialog-order-ticket.model';

/** What a click on „Kaufen“ or „Verkaufen“ leads to. */
type TicketStart =
  { kind: 'ticket'; data: OrderTicketDialogData; series: number } | { kind: 'no-depot' };

/**
 * The order ticket (AP 5.4, TS §11.4, §11.6): `clickedBuy`/`clickedSell` open it for a tradable
 * instrument with the preselected depot, watch the instrument's quote under
 * `ORDER_TICKET_SUBSCRIPTION` while it is open and turn its result into `submittedPlaceOrder`.
 * Without an open depot a hint offers „Konto eröffnen“ instead. The focus goes into the first
 * field (`cdkFocusInitial`), Escape closes and the CDK returns the focus to the button.
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
      map(() => BankingActions.clickedOpenAccount({})),
    );
  }
}
