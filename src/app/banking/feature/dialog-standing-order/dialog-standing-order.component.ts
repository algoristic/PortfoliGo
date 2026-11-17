import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { Component, computed, inject, signal } from '@angular/core';
import { form, FormField, FormRoot } from '@angular/forms/signals';

import { MAX_PURPOSE_LENGTH, purposeLength } from '@app/banking/domain/bank-command-logic';
import { AccountId } from '@app/banking/domain/models/account.model';
import {
  STANDING_ORDER_FIRST_DAY,
  STANDING_ORDER_LAST_DAY,
} from '@app/banking/domain/models/standing-order.model';
import { accountTitle } from '@app/banking/ui/labels/banking-labels';
import { StandingOrderFormModel } from '@app/banking/ui/models/standing-order-form.model';
import { standingOrderSchema } from '@app/banking/ui/schemas/standing-order-schema';
import { AmountInputComponent } from '@app/shared/ui/amount-input/amount-input.component';
import { ButtonDirective } from '@app/shared/ui/button/button.directive';
import { DialogComponent } from '@app/shared/ui/dialog/dialog.component';

import { InputDirective } from '@app/shared/ui/input/input.directive';
import { SelectDirective } from '@app/shared/ui/select/select.directive';

import { StandingOrderDialogData, StandingOrderDialogResult } from './dialog-standing-order.model';

/**
 * Creates or changes a standing order (US-BK-10, TS §7.4): source, target, amount, execution day
 * (1–28) and purpose. Funds count on the execution day, so the amount is not limited here; the
 * engine checks the command again.
 */
@Component({
  selector: 'app-dialog-standing-order',
  imports: [
    SelectDirective,
    InputDirective,
    DialogComponent,
    ButtonDirective,
    FormField,
    FormRoot,
    AmountInputComponent,
  ],
  templateUrl: './dialog-standing-order.component.html',
  host: { class: 'block' },
})
export class DialogStandingOrderComponent {
  readonly #dialogRef = inject<DialogRef<StandingOrderDialogResult>>(DialogRef);
  data = inject<StandingOrderDialogData>(DIALOG_DATA);

  maxPurposeLength = MAX_PURPOSE_LENGTH;
  accountOptions = this.data.accounts.map((account) => ({
    id: account.id,
    label: accountTitle(account, account.bank?.name),
  }));
  dayOptions = Array.from(
    { length: STANDING_ORDER_LAST_DAY - STANDING_ORDER_FIRST_DAY + 1 },
    (_, i) => String(STANDING_ORDER_FIRST_DAY + i),
  );

  standingOrderModel = signal<StandingOrderFormModel>({ ...this.data.initial });
  standingOrderForm = form(this.standingOrderModel, standingOrderSchema, {
    submission: {
      action: async (field) => {
        const { fromAccountId, toAccountId, amount, day, purpose } = field().value();
        if (amount !== null) {
          this.#dialogRef.close({
            fromAccountId: fromAccountId as AccountId,
            toAccountId: toAccountId as AccountId,
            amount,
            day: Number(day),
            purpose,
          });
        }
      },
    },
  });

  purposeLength = computed(() => purposeLength(this.standingOrderForm.purpose().value()));

  heading =
    this.data.mode === 'create'
      ? $localize`:@@featureBanking-dialogStandingOrder-createHeading:Dauerauftrag anlegen`
      : $localize`:@@featureBanking-dialogStandingOrder-changeHeading:Dauerauftrag ändern`;
  submitLabel =
    this.data.mode === 'create'
      ? $localize`:@@featureBanking-dialogStandingOrder-create:Anlegen`
      : $localize`:@@featureBanking-dialogStandingOrder-save:Speichern`;

  decline(): void {
    this.#dialogRef.close();
  }
}
