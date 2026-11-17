import { Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';

import { FormatGameDatePipe } from '@app/clock/ui/pipes/format-game-date/format-game-date.pipe';
import { AccountView } from '@app/engine/domain/models/account-view.model';
import { TermHintComponent } from '@app/help/ui/term-hint/term-hint.component';
import { BadgeComponent } from '@app/shared/ui/badge/badge.component';
import { ButtonDirective } from '@app/shared/ui/button/button.directive';
import { CardDirective } from '@app/shared/ui/card/card.directive';
import { IconDirective } from '@app/shared/ui/icon/icon.directive';
import { FormatCentsPipe } from '@app/shared/ui/pipes/format-cents/format-cents.pipe';
import { Bank } from '@app/world/domain/models/bank.model';

import { accountKindLabel } from '../labels/banking-labels';
import { AccountKindLabelPipe } from '../pipes/account-kind-label/account-kind-label.pipe';

/**
 * An account in the overview (US-BK-02, AP 3.4): bank, kind and number, balance, for current
 * accounts the overdraft limit and the available amount, and the link to its statement.
 * `[accountActions]` takes the actions of the account (AP 3.5).
 */
@Component({
  selector: 'app-account-card',
  imports: [
    CardDirective,
    TermHintComponent,
    RouterLink,
    BadgeComponent,
    ButtonDirective,
    IconDirective,
    FormatCentsPipe,
    FormatGameDatePipe,
    AccountKindLabelPipe,
  ],
  templateUrl: './account-card.component.html',
  host: { class: 'block' },
})
export class AccountCardComponent {
  account = input.required<AccountView>();
  bank = input<Bank | null>();

  balanceClass = computed(() => (this.account().balance < 0 ? 'text-down' : 'text-fg'));
  statementLabel = computed(
    () =>
      $localize`:@@uiBanking-accountCard-statementLabel:Kontoauszug ${accountKindLabel(this.account().kind)}:kind: ${this.account().number}:number:`,
  );
}
