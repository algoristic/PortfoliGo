import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';

import { TransactionType } from '@app/banking/domain/models/ledger.model';
import { StatementPeriod } from '@app/banking/domain/models/statement.model';
import { AccountHeaderComponent } from '@app/banking/ui/account-header/account-header.component';
import { StatementFilterComponent } from '@app/banking/ui/statement-filter/statement-filter.component';
import { StatementListComponent } from '@app/banking/ui/statement-list/statement-list.component';
import { StatementListRange } from '@app/banking/ui/statement-list/statement-list.model';
import { ButtonDirective } from '@app/shared/ui/button/button.directive';
import { EmptyStateComponent } from '@app/shared/ui/empty-state/empty-state.component';
import { IconDirective } from '@app/shared/ui/icon/icon.directive';
import { PanelComponent } from '@app/shared/ui/panel/panel.component';
import { FormatNumberPipe } from '@app/shared/ui/pipes/format-number/format-number.pipe';
import { SkeletonComponent } from '@app/shared/ui/skeleton/skeleton.component';

import { BankingFacade } from '../state/banking.facade';

/**
 * Statement of an account (US-BK-06, AP 3.4): the store holds only the loaded window, the list
 * reports the rendered rows and the effects load what is missing (TS §11.3).
 */
@Component({
  selector: 'app-account-statement-page',
  imports: [
    CommonModule,
    RouterLink,
    AccountHeaderComponent,
    StatementFilterComponent,
    StatementListComponent,
    ButtonDirective,
    EmptyStateComponent,
    IconDirective,
    PanelComponent,
    FormatNumberPipe,
    SkeletonComponent,
  ],
  templateUrl: './account-statement.page.html',
  host: { class: 'block' },
})
export class AccountStatementPage {
  bankingFacade = inject(BankingFacade);

  onSelectPeriod(period: StatementPeriod): void {
    this.bankingFacade.selectStatementPeriod(period);
  }

  onSelectTypes(types: TransactionType[]): void {
    this.bankingFacade.selectStatementTypes(types);
  }

  onSearch(search: string): void {
    this.bankingFacade.searchStatement(search);
  }

  onResetFilter(): void {
    this.bankingFacade.resetStatementFilter();
  }

  onChangeRange(range: StatementListRange): void {
    this.bankingFacade.scrollStatement(range);
  }
}
