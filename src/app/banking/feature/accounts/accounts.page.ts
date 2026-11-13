import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';

import { AccountCardComponent } from '@app/banking/ui/account-card/account-card.component';
import { AccountTotalsComponent } from '@app/banking/ui/account-totals/account-totals.component';
import { SkeletonComponent } from '@app/shared/ui/skeleton/skeleton.component';

import { BankingFacade } from '../state/banking.facade';

/** Account overview (US-BK-02, AP 3.4): the open accounts as cards, totals, the closed ones apart. */
@Component({
  selector: 'app-accounts-page',
  imports: [CommonModule, AccountCardComponent, AccountTotalsComponent, SkeletonComponent],
  templateUrl: './accounts.page.html',
  host: { class: 'block' },
})
export class AccountsPage {
  bankingFacade = inject(BankingFacade);
}
