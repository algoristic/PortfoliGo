import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { Component, inject, signal } from '@angular/core';
import { form, FormField, FormRoot, required } from '@angular/forms/signals';

import { AccountId } from '@app/banking/domain/models/account.model';
import { accountTitle, transactionTypeLabel } from '@app/banking/ui/labels/banking-labels';
import { ButtonDirective } from '@app/shared/ui/button/button.directive';
import { DialogComponent } from '@app/shared/ui/dialog/dialog.component';
import { FormatCentsPipe } from '@app/shared/ui/pipes/format-cents/format-cents.pipe';
import { SelectDirective } from '@app/shared/ui/select/select.directive';
import { formatSignedCents } from '@app/shared/util/format';

import {
  CloseAccountDialogData,
  CloseAccountDialogResult,
  CloseAccountFormModel,
} from './dialog-close-account.model';

import { bankCommandErrorMessage } from '../state/banking-errors.utils';

/**
 * Closes an account (US-BK-03): shows the settlement of the closing preview, the reasons that keep
 * the account from closing and, when a balance remains, the account it goes to. Confirming is
 * blocked while a reason exists; the engine checks the command again.
 */
@Component({
  selector: 'app-dialog-close-account',
  imports: [
    SelectDirective,
    DialogComponent,
    ButtonDirective,
    FormField,
    FormRoot,
    FormatCentsPipe,
  ],
  templateUrl: './dialog-close-account.component.html',
  host: { class: 'block' },
})
export class DialogCloseAccountComponent {
  readonly #dialogRef = inject<DialogRef<CloseAccountDialogResult>>(DialogRef);
  data = inject<CloseAccountDialogData>(DIALOG_DATA);

  accountTitle = accountTitle(this.data.account, this.data.account.bank?.name);
  bookings = this.data.preview.bookings.map((booking, index) => ({
    id: index,
    label: transactionTypeLabel(booking.type),
    amount: formatSignedCents(booking.amount),
    amountClass: booking.amount < 0 ? 'text-down' : 'text-up',
  }));
  blockers = this.data.preview.blockers.map((blocker) => ({
    id: blocker,
    message: bankCommandErrorMessage(blocker),
  }));
  blocked = this.blockers.length > 0;
  needsTarget =
    !this.blocked &&
    (this.data.preview.remainder > 0 || this.data.preview.pendingDistributions > 0);
  targetOptions = this.data.targets.map((account) => ({
    id: account.id,
    label: accountTitle(account, account.bank?.name),
  }));

  closeAccountModel = signal<CloseAccountFormModel>({
    targetAccountId: this.data.targets.find((account) => account.salaryAccount)?.id ?? '',
  });
  closeAccountForm = form(
    this.closeAccountModel,
    (path) => {
      required(path.targetAccountId, {
        when: () => this.needsTarget,
        message: $localize`:@@featureBanking-dialogCloseAccount-targetRequired:Bitte wähle das Konto, auf das das Restguthaben geht.`,
      });
    },
    {
      submission: {
        action: async (field) => {
          if (!this.blocked) {
            const target = field().value().targetAccountId;
            this.#dialogRef.close({
              targetAccountId: this.needsTarget && target !== '' ? (target as AccountId) : null,
            });
          }
        },
      },
    },
  );

  heading = $localize`:@@featureBanking-dialogCloseAccount-heading:Konto schließen`;

  decline(): void {
    this.#dialogRef.close();
  }
}
