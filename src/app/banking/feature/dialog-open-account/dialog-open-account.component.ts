import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { Component, computed, inject, signal } from '@angular/core';
import { form, FormField, FormRoot, required, validate } from '@angular/forms/signals';

import { openAccountError } from '@app/banking/domain/bank-command-logic';
import {
  OPENABLE_ACCOUNT_KINDS,
  OpenableAccountKind,
} from '@app/banking/domain/models/account.model';
import { AccountConditionsComponent } from '@app/banking/ui/account-conditions/account-conditions.component';
import { bankTypeLabel, openableAccountKindLabel } from '@app/banking/ui/labels/banking-labels';
import { ButtonDirective } from '@app/shared/ui/button/button.directive';
import { DialogComponent } from '@app/shared/ui/dialog/dialog.component';
import { Bank } from '@app/world/domain/models/bank.model';

import {
  OpenAccountDialogData,
  OpenAccountDialogResult,
  OpenAccountFormModel,
} from './dialog-open-account.model';

/**
 * Opens an account or a depot (US-BK-02): the bank, the kinds it offers (a depot always) and the
 * conditions of the chosen kind before opening (PS §10.1). The engine checks the command again.
 */
@Component({
  selector: 'app-dialog-open-account',
  imports: [DialogComponent, ButtonDirective, FormField, FormRoot, AccountConditionsComponent],
  templateUrl: './dialog-open-account.component.html',
  host: { class: 'block' },
})
export class DialogOpenAccountComponent {
  readonly #dialogRef = inject<DialogRef<OpenAccountDialogResult>>(DialogRef);
  data = inject<OpenAccountDialogData>(DIALOG_DATA);

  bankOptions = this.data.banks.map((bank) => ({
    id: bank.id,
    label: `${bank.name} · ${bankTypeLabel(bank.type)}`,
  }));

  openAccountModel = signal<OpenAccountFormModel>({
    bankId: this.data.bankId,
    kind: offeredKinds(findBank(this.data.banks, this.data.bankId))[0] ?? '',
  });
  openAccountForm = form(
    this.openAccountModel,
    (path) => {
      required(path.bankId, {
        message: $localize`:@@featureBanking-dialogOpenAccount-bankRequired:Bitte wähle eine Bank.`,
      });
      validate(path.kind, ({ value, valueOf }) => {
        const kind = value();
        const bank = findBank(this.data.banks, valueOf(path.bankId));
        return bank !== undefined &&
          (kind === '' || openAccountError(bank.conditions, kind) !== null)
          ? {
              kind: 'not-offered',
              message: $localize`:@@featureBanking-dialogOpenAccount-kindRequired:Bitte wähle eine Kontoart, die diese Bank anbietet.`,
            }
          : null;
      });
    },
    {
      submission: {
        action: async (field) => {
          const { bankId, kind } = field().value();
          if (kind !== '') {
            this.#dialogRef.close({ bankId, kind });
          }
        },
      },
    },
  );

  selectedBank = computed(() => findBank(this.data.banks, this.openAccountForm.bankId().value()));
  kindOptions = computed(() =>
    offeredKinds(this.selectedBank()).map((kind) => ({
      kind,
      label: openableAccountKindLabel(kind),
    })),
  );
  selectedKind = computed(() => {
    const kind = this.openAccountForm.kind().value();
    return this.kindOptions().some((option) => option.kind === kind) && kind !== '' ? kind : null;
  });

  heading = $localize`:@@featureBanking-dialogOpenAccount-heading:Konto eröffnen`;

  decline(): void {
    this.#dialogRef.close();
  }
}

function findBank(banks: readonly Bank[], bankId: string): Bank | undefined {
  return banks.find((bank) => bank.id === bankId);
}

function offeredKinds(bank: Bank | undefined): OpenableAccountKind[] {
  return bank === undefined
    ? []
    : OPENABLE_ACCOUNT_KINDS.filter((kind) => openAccountError(bank.conditions, kind) === null);
}
