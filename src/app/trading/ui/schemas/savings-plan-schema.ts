import { disabled, required, schema, Schema, validate } from '@angular/forms/signals';

import { DepotId } from '@app/banking/domain/models/account.model';
import { FeeModel } from '@app/banking/domain/models/bank-conditions.model';
import { formatCents } from '@app/shared/util/format';
import {
  SAVINGS_PLAN_FIRST_DAY,
  SAVINGS_PLAN_LAST_DAY,
  SAVINGS_PLAN_MIN_AMOUNT,
  SavingsPlanSpec,
} from '@app/trading/domain/models/savings-plan.model';
import { savingsPlanCosts } from '@app/trading/domain/savings-plan-logic';

import { SavingsPlanFormModel } from '../models/savings-plan.model';

/** What the savings plan schema needs besides the model. */
export interface SavingsPlanSchemaOptions {
  /** Savings plan costs of the depot's bank; `null` for an unknown depot. */
  feeOf: (depotId: string) => FeeModel | null;
  /** Changing a plan keeps depot and instrument (TS §7.8). */
  fixedTarget: boolean;
}

/**
 * A savings plan (US-HD-05, TS §7.8): a depot, an eligible instrument, an amount of at least
 * `SAVINGS_PLAN_MIN_AMOUNT` above the bank's savings plan costs and a day from 1 to 28. The amount
 * is not limited by the balance: funds count on the execution day. When changing, depot and
 * instrument are disabled. The engine checks the command again (TS §11.8).
 */
export function savingsPlanSchema(options: SavingsPlanSchemaOptions): Schema<SavingsPlanFormModel> {
  return schema<SavingsPlanFormModel>((path) => {
    disabled(path.depotId, () => options.fixedTarget);
    disabled(path.instrumentId, () => options.fixedTarget);
    required(path.depotId, {
      message: $localize`:@@uiTrading-savingsPlanSchema-depotRequired:Bitte wähle das Depot.`,
    });
    required(path.instrumentId, {
      message: $localize`:@@uiTrading-savingsPlanSchema-instrumentRequired:Bitte wähle ein Wertpapier.`,
    });
    required(path.amount, {
      message: $localize`:@@uiTrading-savingsPlanSchema-amountRequired:Bitte gib einen Betrag ein.`,
    });
    validate(path.amount, ({ value, valueOf }) => {
      const amount = value();
      if (amount === null) {
        return null;
      }
      if (amount < SAVINGS_PLAN_MIN_AMOUNT) {
        return {
          kind: 'amount-too-small',
          message: $localize`:@@uiTrading-savingsPlanSchema-belowMinimum:Der Betrag muss mindestens ${formatCents(SAVINGS_PLAN_MIN_AMOUNT)}:min: sein.`,
        };
      }
      const fee = options.feeOf(valueOf(path.depotId));
      return fee !== null && savingsPlanCosts(fee, amount) >= amount
        ? {
            kind: 'amount-below-costs',
            message: $localize`:@@uiTrading-savingsPlanSchema-belowCosts:Der Betrag muss über den Sparplankosten der Bank von ${formatCents(savingsPlanCosts(fee, amount))}:costs: liegen.`,
          }
        : null;
    });
    required(path.day, {
      message: $localize`:@@uiTrading-savingsPlanSchema-dayRequired:Bitte wähle den Ausführungstag.`,
    });
    validate(path.day, ({ value }) => {
      if (value() === '') {
        return null;
      }
      const day = Number(value());
      return Number.isInteger(day) && day >= SAVINGS_PLAN_FIRST_DAY && day <= SAVINGS_PLAN_LAST_DAY
        ? null
        : {
            kind: 'invalid-day',
            message: $localize`:@@uiTrading-savingsPlanSchema-invalidDay:Der Ausführungstag muss zwischen dem 1. und dem 28. liegen.`,
          };
    });
  });
}

/** The command values of a valid form, or `null` while a field is empty. */
export function savingsPlanSpecOf(model: SavingsPlanFormModel): SavingsPlanSpec | null {
  const { depotId, instrumentId, amount, day } = model;
  return depotId === '' || instrumentId === '' || amount === null || day === ''
    ? null
    : { depotId: depotId as DepotId, instrumentId, amount, day: Number(day) };
}
