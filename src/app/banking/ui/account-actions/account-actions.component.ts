import { Component, computed, input, output } from '@angular/core';

import { AccountView } from '@app/engine/domain/models/account-view.model';
import { ButtonDirective } from '@app/shared/ui/button/button.directive';
import { IconDirective } from '@app/shared/ui/icon/icon.directive';

import { accountTitle } from '../labels/banking-labels';

/**
 * Actions of an open account (US-BK-03–05, AP 3.5): transfer, make it the salary account (current
 * accounts that aren't yet) and close. The names include the account, because a page lists several.
 */
@Component({
  selector: 'app-account-actions',
  imports: [ButtonDirective, IconDirective],
  templateUrl: './account-actions.component.html',
  host: { class: 'contents' },
})
export class AccountActionsComponent {
  account = input.required<AccountView>();
  /** A transfer needs a second open account. */
  canTransfer = input(true);
  /** Prefix of the test IDs, e.g. `banking.accounts.card`. */
  testId = input.required<string>();

  clickedTransfer = output<void>();
  clickedSalaryAccount = output<void>();
  clickedClose = output<void>();

  showSalaryAccount = computed(
    () => this.account().kind === 'current' && !this.account().salaryAccount,
  );
  #title = computed(() => accountTitle(this.account(), null));

  transferLabel = computed(
    () =>
      $localize`:@@uiBanking-accountActions-transferLabel:Überweisen von ${this.#title()}:account:`,
  );
  salaryAccountLabel = computed(
    () =>
      $localize`:@@uiBanking-accountActions-salaryAccountLabel:${this.#title()}:account: als Gehaltskonto wählen`,
  );
  closeLabel = computed(
    () => $localize`:@@uiBanking-accountActions-closeLabel:${this.#title()}:account: schließen`,
  );

  onTransfer(): void {
    this.clickedTransfer.emit();
  }

  onSalaryAccount(): void {
    this.clickedSalaryAccount.emit();
  }

  onClose(): void {
    this.clickedClose.emit();
  }
}
