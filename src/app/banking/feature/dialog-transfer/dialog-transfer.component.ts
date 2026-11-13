import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { Component, computed, inject, signal } from '@angular/core';
import { form, FormField, FormRoot } from '@angular/forms/signals';

import { MAX_PURPOSE_LENGTH, purposeLength } from '@app/banking/domain/bank-command-logic';
import { AccountId } from '@app/banking/domain/models/account.model';
import { accountTitle } from '@app/banking/ui/labels/banking-labels';
import { TransferFormModel } from '@app/banking/ui/models/transfer-form.model';
import { transferSchema } from '@app/banking/ui/schemas/transfer-schema';
import { AmountInputComponent } from '@app/shared/ui/amount-input/amount-input.component';
import { ButtonDirective } from '@app/shared/ui/button/button.directive';
import { DialogComponent } from '@app/shared/ui/dialog/dialog.component';
import { FormatCentsPipe } from '@app/shared/ui/pipes/format-cents/format-cents.pipe';

import { TransferDialogData, TransferDialogResult } from './dialog-transfer.model';

/**
 * A transfer between own accounts (US-BK-04): source, target, amount and purpose. Shows the
 * available amount of the source; instant and free (E-17). The engine checks the command again.
 */
@Component({
  selector: 'app-dialog-transfer',
  imports: [
    DialogComponent,
    ButtonDirective,
    FormField,
    FormRoot,
    AmountInputComponent,
    FormatCentsPipe,
  ],
  templateUrl: './dialog-transfer.component.html',
  host: { class: 'block' },
})
export class DialogTransferComponent {
  readonly #dialogRef = inject<DialogRef<TransferDialogResult>>(DialogRef);
  data = inject<TransferDialogData>(DIALOG_DATA);

  maxPurposeLength = MAX_PURPOSE_LENGTH;
  accountOptions = this.data.accounts.map((account) => ({
    id: account.id,
    label: accountTitle(account, account.bank?.name),
  }));

  transferModel = signal<TransferFormModel>({
    fromAccountId: this.data.fromAccountId,
    // With only one other account there is nothing to choose.
    toAccountId: this.#onlyOtherAccount(this.data.fromAccountId),
    amount: null,
    purpose: '',
  });
  transferForm = form(this.transferModel, transferSchema(this.data.accounts), {
    submission: {
      action: async (field) => {
        const { fromAccountId, toAccountId, amount, purpose } = field().value();
        if (amount !== null) {
          this.#dialogRef.close({
            fromAccountId: fromAccountId as AccountId,
            toAccountId: toAccountId as AccountId,
            amount,
            purpose,
          });
        }
      },
    },
  });

  available = computed(
    () =>
      this.data.accounts.find((account) => account.id === this.transferForm.fromAccountId().value())
        ?.available ?? null,
  );
  purposeLength = computed(() => purposeLength(this.transferForm.purpose().value()));

  heading = $localize`:@@featureBanking-dialogTransfer-heading:Überweisen`;

  decline(): void {
    this.#dialogRef.close();
  }

  #onlyOtherAccount(fromAccountId: AccountId): string {
    const others = this.data.accounts.filter((account) => account.id !== fromAccountId);
    return others.length === 1 ? others[0].id : '';
  }
}
