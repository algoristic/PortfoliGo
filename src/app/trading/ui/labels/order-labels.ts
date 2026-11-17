import { formatCents } from '@app/shared/util/format';
import {
  MIN_ORDER_VALUE,
  OrderCommandError,
  OrderSide,
  OrderStatus,
  OrderType,
  OrderValidityKind,
} from '@app/trading/domain/models/order.model';

/** Names of the order sides (US-HD-01, US-HD-02). */
export function orderSideLabel(side: OrderSide): string {
  switch (side) {
    case 'buy':
      return $localize`:@@uiTrading-orderLabels-buy:Kauf`;
    case 'sell':
      return $localize`:@@uiTrading-orderLabels-sell:Verkauf`;
  }
}

/** Names of the order types (US-HD-03). */
export function orderTypeLabel(type: OrderType): string {
  switch (type) {
    case 'market':
      return $localize`:@@uiTrading-orderLabels-market:Market (bestens/billigst)`;
    case 'limit':
      return $localize`:@@uiTrading-orderLabels-limit:Limit`;
    case 'stop':
      return $localize`:@@uiTrading-orderLabels-stop:Stop (Stop-Loss/Stop-Buy)`;
    case 'stop-limit':
      return $localize`:@@uiTrading-orderLabels-stopLimit:Stop-Limit`;
  }
}

/** Names of the order states (TS §7.5, US-HD-04). */
export function orderStatusLabel(status: OrderStatus): string {
  switch (status) {
    case 'open':
      return $localize`:@@uiTrading-orderLabels-statusOpen:Offen`;
    case 'triggered':
      return $localize`:@@uiTrading-orderLabels-statusTriggered:Ausgelöst`;
    case 'executed':
      return $localize`:@@uiTrading-orderLabels-statusExecuted:Ausgeführt`;
    case 'cancelled':
      return $localize`:@@uiTrading-orderLabels-statusCancelled:Storniert`;
    case 'expired':
      return $localize`:@@uiTrading-orderLabels-statusExpired:Abgelaufen`;
    case 'rejected':
      return $localize`:@@uiTrading-orderLabels-statusRejected:Abgelehnt`;
  }
}

/** Names of the validities (US-HD-03, TS §7.5). */
export function orderValidityLabel(kind: OrderValidityKind): string {
  switch (kind) {
    case 'day':
      return $localize`:@@uiTrading-orderLabels-day:Bis Tagesende`;
    case 'date':
      return $localize`:@@uiTrading-orderLabels-date:Bis Datum`;
    case 'gtc':
      return $localize`:@@uiTrading-orderLabels-gtc:Bis auf Widerruf (1 Jahr)`;
  }
}

/**
 * Text of an engine code of the order rules (TS §7.5, §8.6) for the order ticket and the toasts;
 * `shortfall` names the missing money of `insufficient-funds` (US-HD-01).
 */
export function orderCommandErrorLabel(code: OrderCommandError, shortfall: number | null): string {
  switch (code) {
    case 'unknown-depot':
      return $localize`:@@uiTrading-orderLabels-unknownDepot:Dieses Depot gibt es nicht.`;
    case 'depot-closed':
      return $localize`:@@uiTrading-orderLabels-depotClosed:Dieses Depot ist geschlossen.`;
    case 'unknown-instrument':
      return $localize`:@@uiTrading-orderLabels-unknownInstrument:Dieses Wertpapier gibt es nicht.`;
    case 'instrument-not-tradable':
      return $localize`:@@uiTrading-orderLabels-notTradable:Indizes sind nicht handelbar. Handle sie über einen ETF.`;
    case 'invalid-quantity':
      return $localize`:@@uiTrading-orderLabels-invalidQuantity:Die Stückzahl muss größer als 0 sein (höchstens sechs Nachkommastellen).`;
    case 'invalid-amount':
      return $localize`:@@uiTrading-orderLabels-invalidAmount:Der Betrag muss mindestens 0,01 € sein.`;
    case 'amount-only-for-buy':
      return $localize`:@@uiTrading-orderLabels-amountOnlyForBuy:Verkaufen lässt sich nur nach Stückzahl.`;
    case 'fractional-not-allowed':
      return $localize`:@@uiTrading-orderLabels-fractionalNotAllowed:Diese Bank kauft nur ganze Stück.`;
    case 'invalid-limit':
      return $localize`:@@uiTrading-orderLabels-invalidLimit:Bitte gib ein Limit größer als 0 ein.`;
    case 'invalid-stop':
      return $localize`:@@uiTrading-orderLabels-invalidStop:Bitte gib einen Stop-Kurs größer als 0 ein.`;
    case 'invalid-validity':
      return $localize`:@@uiTrading-orderLabels-invalidValidity:Das Datum darf nicht in der Vergangenheit liegen.`;
    case 'validity-too-long':
      return $localize`:@@uiTrading-orderLabels-validityTooLong:Eine Order gilt höchstens ein Jahr.`;
    case 'insufficient-quantity':
      return $localize`:@@uiTrading-orderLabels-insufficientQuantity:So viele freie Stück liegen nicht im Depot (offene Verkaufsorders sind abgezogen).`;
    case 'price-floor':
      return $localize`:@@uiTrading-orderLabels-priceFloor:Der Kurs liegt an der Kursuntergrenze. Kaufen ist gesperrt.`;
    case 'clearing-account-negative':
      return $localize`:@@uiTrading-orderLabels-clearingNegative:Das Verrechnungskonto ist im Minus. Gleiche es zuerst aus, dann kannst du wieder kaufen.`;
    case 'insufficient-funds':
      return shortfall === null || shortfall <= 0
        ? $localize`:@@uiTrading-orderLabels-insufficientFunds:Das Guthaben auf dem Verrechnungskonto reicht nicht.`
        : $localize`:@@uiTrading-orderLabels-insufficientFundsShortfall:Das Guthaben auf dem Verrechnungskonto reicht nicht, es fehlen ${formatCents(shortfall)}:shortfall:.`;
    case 'amount-too-small':
      return $localize`:@@uiTrading-orderLabels-amountTooSmall:Der Betrag reicht nach Abzug der Kosten für kein Stück.`;
    case 'order-value-too-small':
      return $localize`:@@uiTrading-orderLabels-orderValueTooSmall:Ein Kauf braucht einen Kurswert von mindestens ${formatCents(MIN_ORDER_VALUE)}:minimum:.`;
    case 'unknown-order':
      return $localize`:@@uiTrading-orderLabels-unknownOrder:Diese Order gibt es nicht.`;
    case 'order-not-active':
      return $localize`:@@uiTrading-orderLabels-orderNotActive:Die Order ist nicht mehr offen.`;
    case 'stop-triggered':
      return $localize`:@@uiTrading-orderLabels-stopTriggered:Der Stop wurde schon ausgelöst und lässt sich nicht mehr ändern.`;
  }
}
