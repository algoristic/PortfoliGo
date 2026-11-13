import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { Component, inject, signal } from '@angular/core';
import { form, FormField, FormRoot, required } from '@angular/forms/signals';

import { AccountId } from '@app/banking/domain/models/account.model';
import { accountTitle } from '@app/banking/ui/labels/banking-labels';
import { BadgeComponent } from '@app/shared/ui/badge/badge.component';
import { ButtonDirective } from '@app/shared/ui/button/button.directive';
import { DialogComponent } from '@app/shared/ui/dialog/dialog.component';

import {
  SalaryAccountDialogData,
  SalaryAccountDialogResult,
  SalaryAccountFormModel,
} from './dialog-salary-account.model';

/**
 * Chooses the salary account among the open current accounts (US-BK-05) and explains how the
 * overdraft limits follow the salary over three months (TS §7.4).
 */
@Component({
  selector: 'app-dialog-salary-account',
  imports: [DialogComponent, ButtonDirective, BadgeComponent, FormField, FormRoot],
  templateUrl: './dialog-salary-account.component.html',
  host: { class: 'block' },
})
export class DialogSalaryAccountComponent {
  readonly #dialogRef = inject<DialogRef<SalaryAccountDialogResult>>(DialogRef);
  data = inject<SalaryAccountDialogData>(DIALOG_DATA);

  accountOptions = this.data.accounts.map((account) => ({
    id: account.id,
    label: accountTitle(account, account.bank?.name),
    salaryAccount: account.salaryAccount,
  }));

  salaryAccountModel = signal<SalaryAccountFormModel>({ accountId: this.data.accountId });
  salaryAccountForm = form(
    this.salaryAccountModel,
    (path) => {
      required(path.accountId, {
        message: $localize`:@@featureBanking-dialogSalaryAccount-accountRequired:Bitte wähle ein Girokonto.`,
      });
    },
    {
      submission: {
        action: async (field) => this.#dialogRef.close(field().value().accountId as AccountId),
      },
    },
  );

  heading = $localize`:@@featureBanking-dialogSalaryAccount-heading:Gehaltskonto wechseln`;

  decline(): void {
    this.#dialogRef.close();
  }
}
