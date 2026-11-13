import { CommonModule } from '@angular/common';
import { Component, effect, ElementRef, inject, Injector, viewChild } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { map } from 'rxjs';

import { AccountId } from '@app/banking/domain/models/account.model';
import { AccountActionsComponent } from '@app/banking/ui/account-actions/account-actions.component';
import { AccountCardComponent } from '@app/banking/ui/account-card/account-card.component';
import { AccountTotalsComponent } from '@app/banking/ui/account-totals/account-totals.component';
import { MonthlyOverviewComponent } from '@app/banking/ui/monthly-overview/monthly-overview.component';
import { ButtonDirective } from '@app/shared/ui/button/button.directive';
import { focusIfLost } from '@app/shared/ui/focus/focus-if-lost';
import { IconDirective } from '@app/shared/ui/icon/icon.directive';
import { SkeletonComponent } from '@app/shared/ui/skeleton/skeleton.component';
import { TabPanelDirective } from '@app/shared/ui/tabs/tab-panel.directive';
import { TabsComponent } from '@app/shared/ui/tabs/tabs.component';
import { TabItem } from '@app/shared/ui/tabs/tabs.model';

import { BankingFacade } from '../state/banking.facade';

/**
 * Account overview (US-BK-02, AP 3.4) with the bank commands (AP 3.5): the open accounts as cards
 * with their actions, totals, the closed ones apart, and the monthly overview (US-EK-03) as a tab.
 */
@Component({
  selector: 'app-accounts-page',
  imports: [
    CommonModule,
    RouterLink,
    AccountActionsComponent,
    AccountCardComponent,
    AccountTotalsComponent,
    MonthlyOverviewComponent,
    ButtonDirective,
    IconDirective,
    SkeletonComponent,
    TabPanelDirective,
    TabsComponent,
  ],
  templateUrl: './accounts.page.html',
  host: { class: 'block' },
})
export class AccountsPage {
  bankingFacade = inject(BankingFacade);
  readonly #injector = inject(Injector);

  openAccountButton = viewChild<ElementRef<HTMLElement>>('openAccountButton');

  /** Open accounts and the salary account: closing or switching removes the focused button. */
  #actionsKey = toSignal(
    this.bankingFacade.accountOverview$.pipe(
      map(({ open }) =>
        open.map((account) => `${account.id}${account.salaryAccount ? '*' : ''}`).join(','),
      ),
    ),
    { initialValue: '' },
  );

  tabs: TabItem[] = [
    { id: 'accounts', label: $localize`:@@featureBanking-accountsPage-accountsTab:Konten` },
    { id: 'months', label: $localize`:@@featureBanking-accountsPage-monthsTab:Monatsübersicht` },
  ];
  tabsLabel = $localize`:@@featureBanking-accountsPage-tabsLabel:Ansicht`;

  constructor() {
    // An action button that disappears with its account or with the salary badge takes the focus
    // along; it goes to „Konto eröffnen“ instead of falling back to `<body>` (TS §11.10).
    let previousKey = '';
    effect(() => {
      const key = this.#actionsKey();
      if (previousKey !== '' && key !== previousKey) {
        focusIfLost(this.#injector, () => this.openAccountButton()?.nativeElement);
      }
      previousKey = key;
    });
  }

  onOpenAccount(): void {
    this.bankingFacade.clickOpenAccount();
  }

  onTransfer(fromAccountId?: AccountId): void {
    this.bankingFacade.clickTransfer(fromAccountId);
  }

  onSalaryAccount(accountId: AccountId): void {
    this.bankingFacade.clickSalaryAccount(accountId);
  }

  onCloseAccount(accountId: AccountId): void {
    this.bankingFacade.clickCloseAccount(accountId);
  }
}
