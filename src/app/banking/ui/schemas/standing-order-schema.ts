import { required, schema, Schema, validate } from '@angular/forms/signals';

import { MAX_PURPOSE_LENGTH, purposeLength } from '@app/banking/domain/bank-command-logic';
import {
  STANDING_ORDER_FIRST_DAY,
  STANDING_ORDER_LAST_DAY,
} from '@app/banking/domain/models/standing-order.model';

import { StandingOrderFormModel } from '../models/standing-order-form.model';

/**
 * A standing order (US-BK-10, TS §7.4): two different accounts, an amount of at least 0,01 €, a
 * day from 1 to 28 and a purpose of at most `MAX_PURPOSE_LENGTH` characters. The amount is not
 * limited by the balance: funds count on the execution day. The engine checks the command again
 * (TS §11.8).
 */
export const standingOrderSchema: Schema<StandingOrderFormModel> = schema<StandingOrderFormModel>(
  (path) => {
    required(path.fromAccountId, {
      message: $localize`:@@uiBanking-standingOrderSchema-fromRequired:Bitte wähle das Konto, von dem überwiesen wird.`,
    });
    required(path.toAccountId, {
      message: $localize`:@@uiBanking-standingOrderSchema-toRequired:Bitte wähle das Empfängerkonto.`,
    });
    validate(path.toAccountId, ({ value, valueOf }) =>
      value() !== '' && value() === valueOf(path.fromAccountId)
        ? {
            kind: 'same-account',
            message: $localize`:@@uiBanking-standingOrderSchema-sameAccount:Absender- und Empfängerkonto müssen verschieden sein.`,
          }
        : null,
    );
    required(path.amount, {
      message: $localize`:@@uiBanking-standingOrderSchema-amountRequired:Bitte gib einen Betrag ein.`,
    });
    validate(path.amount, ({ value }) => {
      const amount = value();
      return amount !== null && amount < 1
        ? {
            kind: 'invalid-amount',
            message: $localize`:@@uiBanking-standingOrderSchema-invalidAmount:Der Betrag muss mindestens 0,01 € sein.`,
          }
        : null;
    });
    required(path.day, {
      message: $localize`:@@uiBanking-standingOrderSchema-dayRequired:Bitte wähle den Ausführungstag.`,
    });
    validate(path.day, ({ value }) => {
      if (value() === '') {
        return null;
      }
      const day = Number(value());
      return Number.isInteger(day) &&
        day >= STANDING_ORDER_FIRST_DAY &&
        day <= STANDING_ORDER_LAST_DAY
        ? null
        : {
            kind: 'invalid-day',
            message: $localize`:@@uiBanking-standingOrderSchema-invalidDay:Der Ausführungstag muss zwischen dem 1. und dem 28. liegen.`,
          };
    });
    validate(path.purpose, ({ value }) =>
      purposeLength(value()) > MAX_PURPOSE_LENGTH
        ? {
            kind: 'purpose-too-long',
            message: $localize`:@@uiBanking-standingOrderSchema-purposeTooLong:Der Verwendungszweck darf höchstens ${MAX_PURPOSE_LENGTH}:maxLength: Zeichen lang sein.`,
          }
        : null,
    );
  },
);
