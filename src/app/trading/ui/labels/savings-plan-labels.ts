import { formatCents } from '@app/shared/util/format';
import {
  SAVINGS_PLAN_MIN_AMOUNT,
  SavingsPlanCommandError,
} from '@app/trading/domain/models/savings-plan.model';

import { SavingsPlanEntry, SavingsPlanRow } from '../models/savings-plan.model';

/** Why the engine refused a savings plan command (TS §7.8, §8.6). */
export function savingsPlanCommandErrorLabel(code: SavingsPlanCommandError): string {
  switch (code) {
    case 'unknown-depot':
      return $localize`:@@uiTrading-savingsPlanLabels-unknownDepot:Dieses Depot gibt es nicht.`;
    case 'depot-closed':
      return $localize`:@@uiTrading-savingsPlanLabels-depotClosed:Dieses Depot ist geschlossen.`;
    case 'unknown-instrument':
      return $localize`:@@uiTrading-savingsPlanLabels-unknownInstrument:Dieses Wertpapier gibt es nicht.`;
    case 'not-savings-plan-eligible':
      return $localize`:@@uiTrading-savingsPlanLabels-notEligible:Für dieses Wertpapier gibt es keinen Sparplan. Sparplanfähig sind ETFs und große Aktien.`;
    case 'invalid-amount':
      return $localize`:@@uiTrading-savingsPlanLabels-invalidAmount:Bitte gib einen Betrag in ganzen Cent ein.`;
    case 'amount-too-small':
      return $localize`:@@uiTrading-savingsPlanLabels-amountTooSmall:Der Betrag muss mindestens ${formatCents(SAVINGS_PLAN_MIN_AMOUNT)}:min: sein und über den Sparplankosten liegen.`;
    case 'invalid-day':
      return $localize`:@@uiTrading-savingsPlanLabels-invalidDay:Der Ausführungstag muss zwischen dem 1. und dem 28. liegen.`;
    case 'unknown-savings-plan':
      return $localize`:@@uiTrading-savingsPlanLabels-unknownSavingsPlan:Diesen Sparplan gibt es nicht mehr.`;
  }
}

/** The texts a savings plan shows in the lists of the depot and the order book (US-HD-05). */
export function savingsPlanRow({
  plan,
  instrumentName,
  depotNumber,
  bankName,
}: SavingsPlanEntry): SavingsPlanRow {
  return {
    id: plan.id,
    instrumentId: plan.instrumentId,
    instrumentName,
    depotLabel:
      bankName === null
        ? $localize`:@@uiTrading-savingsPlanLabels-depot:Depot ${depotNumber}:number:`
        : $localize`:@@uiTrading-savingsPlanLabels-depotAtBank:Depot ${depotNumber}:number: · ${bankName}:bank:`,
    amount: plan.amount,
    day: plan.day,
    paused: plan.paused,
    nextExecution: plan.nextExecution,
    name: $localize`:@@uiTrading-savingsPlanLabels-name:Sparplan ${instrumentName}:instrument: über ${formatCents(plan.amount)}:amount:`,
  };
}
