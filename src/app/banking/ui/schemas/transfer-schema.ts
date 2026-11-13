import { required, schema, Schema, validate } from '@angular/forms/signals';

import { MAX_PURPOSE_LENGTH, purposeLength } from '@app/banking/domain/bank-command-logic';
import { AccountView } from '@app/engine/domain/models/account-view.model';
import { formatCents } from '@app/shared/util/format';

import { TransferFormModel } from '../models/transfer-form.model';

/**
 * A transfer between own accounts (US-BK-04, TS §7.4): both accounts chosen and different, an
 * amount of at least 0,01 € up to the available amount of the source, a purpose of at most
 * `MAX_PURPOSE_LENGTH` characters. The engine checks the command again (TS §11.8).
 */
export function transferSchema(
  accounts: readonly Pick<AccountView, 'id' | 'available'>[],
): Schema<TransferFormModel> {
  return schema<TransferFormModel>((path) => {
    required(path.fromAccountId, {
      message: $localize`:@@uiBanking-transferSchema-fromRequired:Bitte wähle das Konto, von dem du überweist.`,
    });
    required(path.toAccountId, {
      message: $localize`:@@uiBanking-transferSchema-toRequired:Bitte wähle das Empfängerkonto.`,
    });
    validate(path.toAccountId, ({ value, valueOf }) =>
      value() !== '' && value() === valueOf(path.fromAccountId)
        ? {
            kind: 'same-account',
            message: $localize`:@@uiBanking-transferSchema-sameAccount:Absender- und Empfängerkonto müssen verschieden sein.`,
          }
        : null,
    );
    required(path.amount, {
      message: $localize`:@@uiBanking-transferSchema-amountRequired:Bitte gib einen Betrag ein.`,
    });
    validate(path.amount, ({ value, valueOf }) => {
      const amount = value();
      if (amount === null) {
        return null;
      }
      if (amount < 1) {
        return {
          kind: 'invalid-amount',
          message: $localize`:@@uiBanking-transferSchema-invalidAmount:Der Betrag muss mindestens 0,01 € sein.`,
        };
      }
      const from = accounts.find((account) => account.id === valueOf(path.fromAccountId));
      if (from !== undefined && amount > from.available) {
        const available = formatCents(from.available);
        return {
          kind: 'insufficient-funds',
          message: $localize`:@@uiBanking-transferSchema-insufficientFunds:Du kannst höchstens ${available}:available: überweisen.`,
        };
      }
      return null;
    });
    validate(path.purpose, ({ value }) =>
      purposeLength(value()) > MAX_PURPOSE_LENGTH
        ? {
            kind: 'purpose-too-long',
            message: $localize`:@@uiBanking-transferSchema-purposeTooLong:Der Verwendungszweck darf höchstens ${MAX_PURPOSE_LENGTH}:maxLength: Zeichen lang sein.`,
          }
        : null,
    );
  });
}
