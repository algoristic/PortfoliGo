import { EngineCommandError } from '@app/engine/data-access/service/engine.service';
import {
  ORDER_COMMAND_ERRORS,
  OrderCommandError,
  OrderSpec,
} from '@app/trading/domain/models/order.model';
import {
  SAVINGS_PLAN_COMMAND_ERRORS,
  SavingsPlanCommandError,
} from '@app/trading/domain/models/savings-plan.model';
import { orderCommandErrorLabel } from '@app/trading/ui/labels/order-labels';
import { savingsPlanCommandErrorLabel } from '@app/trading/ui/labels/savings-plan-labels';
import { OrderTicketContext } from '@app/trading/ui/models/order-ticket.model';
import { ticketPreview } from '@app/trading/ui/schemas/order-ticket-schema';

import { OrderCommand } from './trading.model';

/**
 * Text of a failed order command (TS §8.6, US-HD-01): the reason for every code of the order rules
 * (`insufficient-funds` with the shortfall when known), a running jump or a failed write, otherwise
 * what could not be done.
 */
export function orderCommandFailureMessage(
  command: OrderCommand,
  error: unknown,
  shortfall: number | null = null,
): string {
  if (error instanceof EngineCommandError) {
    if (isOrderCommandError(error.code)) {
      return orderCommandErrorLabel(error.code, shortfall);
    }
    if (error.code === 'busy') {
      return $localize`:@@featureTrading-tradingErrors-busy:Das geht gerade nicht, weil die Spielzeit noch berechnet wird.`;
    }
    if (error.code === 'worker-restarted') {
      return $localize`:@@featureTrading-tradingErrors-workerRestarted:Die Spiel-Engine wurde neu gestartet. Bitte wiederhole die letzte Aktion.`;
    }
    if (error.code === 'storage-failed') {
      return $localize`:@@featureTrading-tradingErrors-storageFailed:Der Auftrag konnte nicht gespeichert werden und wurde nicht ausgeführt.`;
    }
  }
  switch (command) {
    case 'placeOrder':
      return $localize`:@@featureTrading-tradingErrors-placeOrderFailure:Die Order konnte nicht erteilt werden.`;
    case 'changeOrder':
      return $localize`:@@featureTrading-tradingErrors-changeOrderFailure:Die Order konnte nicht geändert werden.`;
    case 'cancelOrder':
      return $localize`:@@featureTrading-tradingErrors-cancelOrderFailure:Die Order konnte nicht storniert werden.`;
  }
}

/**
 * What a refused purchase lacks at the current quote (US-HD-01): the reservation minus the free
 * money of the clearing account, as the order ticket shows it; `null` when it cannot be estimated.
 */
export function placeOrderShortfall(
  order: OrderSpec,
  context: OrderTicketContext | null,
): number | null {
  const depot = context?.depots.find((candidate) => candidate.depotId === order.depotId);
  if (context === null || context === undefined || depot === undefined || order.side !== 'buy') {
    return null;
  }
  return ticketPreview(order, depot, context)?.shortfall ?? null;
}

/** The savings plan commands (TS §8.2) for the texts of their failures. */
export type SavingsPlanCommand =
  'createSavingsPlan' | 'changeSavingsPlan' | 'setSavingsPlanPaused' | 'deleteSavingsPlan';

/**
 * Text of a failed savings plan command (TS §8.6): the reason for every code of the savings plan
 * rules, a running jump or a failed write, otherwise what could not be done.
 */
export function savingsPlanCommandFailureMessage(
  command: SavingsPlanCommand,
  error: unknown,
): string {
  if (error instanceof EngineCommandError) {
    if ((SAVINGS_PLAN_COMMAND_ERRORS as readonly string[]).includes(error.code)) {
      return savingsPlanCommandErrorLabel(error.code as SavingsPlanCommandError);
    }
    if (error.code === 'busy') {
      return $localize`:@@featureTrading-tradingErrors-savingsPlanBusy:Das geht gerade nicht, weil die Spielzeit noch berechnet wird.`;
    }
    if (error.code === 'worker-restarted') {
      return $localize`:@@featureTrading-tradingErrors-savingsPlanWorkerRestarted:Die Spiel-Engine wurde neu gestartet. Bitte wiederhole die letzte Aktion.`;
    }
    if (error.code === 'storage-failed') {
      return $localize`:@@featureTrading-tradingErrors-savingsPlanStorageFailed:Die Änderung konnte nicht gespeichert werden und wurde nicht übernommen.`;
    }
  }
  switch (command) {
    case 'createSavingsPlan':
      return $localize`:@@featureTrading-tradingErrors-createSavingsPlanFailure:Der Sparplan konnte nicht angelegt werden.`;
    case 'changeSavingsPlan':
      return $localize`:@@featureTrading-tradingErrors-changeSavingsPlanFailure:Der Sparplan konnte nicht geändert werden.`;
    case 'setSavingsPlanPaused':
      return $localize`:@@featureTrading-tradingErrors-pauseSavingsPlanFailure:Der Sparplan konnte nicht pausiert oder fortgesetzt werden.`;
    case 'deleteSavingsPlan':
      return $localize`:@@featureTrading-tradingErrors-deleteSavingsPlanFailure:Der Sparplan konnte nicht gelöscht werden.`;
  }
}

function isOrderCommandError(code: string): code is OrderCommandError {
  return (ORDER_COMMAND_ERRORS as readonly string[]).includes(code);
}
