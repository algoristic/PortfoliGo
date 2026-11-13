import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';

import { BankComparisonKey } from '@app/banking/domain/bank-comparison-logic';
import { BankTableComponent } from '@app/banking/ui/bank-table/bank-table.component';
import { ButtonDirective } from '@app/shared/ui/button/button.directive';
import { IconDirective } from '@app/shared/ui/icon/icon.directive';
import { SkeletonComponent } from '@app/shared/ui/skeleton/skeleton.component';

import { BankingFacade } from '../state/banking.facade';

/** Bank comparison (US-BK-01, AP 3.5): conditions of all banks, sortable, „Konto eröffnen“ per bank. */
@Component({
  selector: 'app-banks-page',
  imports: [
    CommonModule,
    RouterLink,
    BankTableComponent,
    ButtonDirective,
    IconDirective,
    SkeletonComponent,
  ],
  templateUrl: './banks.page.html',
  host: { class: 'block' },
})
export class BanksPage {
  bankingFacade = inject(BankingFacade);

  onSort(key: BankComparisonKey): void {
    this.bankingFacade.sortBanks(key);
  }

  onOpenAccount(bankId: string): void {
    this.bankingFacade.clickOpenAccount(bankId);
  }
}
