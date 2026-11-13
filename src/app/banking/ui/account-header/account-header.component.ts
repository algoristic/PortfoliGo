import { Component, computed, input } from '@angular/core';

import { FormatGameDatePipe } from '@app/clock/ui/pipes/format-game-date/format-game-date.pipe';
import { AccountView } from '@app/engine/domain/models/account-view.model';
import { BadgeComponent } from '@app/shared/ui/badge/badge.component';
import { FormatCentsPipe } from '@app/shared/ui/pipes/format-cents/format-cents.pipe';
import { Bank } from '@app/world/domain/models/bank.model';

import { AccountKindLabelPipe } from '../pipes/account-kind-label/account-kind-label.pipe';

/**
 * Head of an account's statement: kind, number, bank, balance and, for current accounts, the
 * available amount. `[accountActions]` takes the actions of the account (AP 3.5).
 */
@Component({
  selector: 'app-account-header',
  imports: [BadgeComponent, FormatCentsPipe, FormatGameDatePipe, AccountKindLabelPipe],
  templateUrl: './account-header.component.html',
  host: { class: 'block' },
})
export class AccountHeaderComponent {
  account = input.required<AccountView>();
  bank = input<Bank | null>();

  balanceClass = computed(() => (this.account().balance < 0 ? 'text-down' : 'text-fg'));
}
