import { inject, Injectable } from '@angular/core';
import { select, Store } from '@ngrx/store';
import { Observable } from 'rxjs';

import { AccountId, OpenableAccountKind } from '@app/banking/domain/models/account.model';
import { TransactionType } from '@app/banking/domain/models/ledger.model';
import { StatementPeriod } from '@app/banking/domain/models/statement.model';
import { TransferPayload } from '@app/engine/data-access/service/engine-service.model';

import * as BankingActions from './banking.actions';
import { AccountEntry, BankCommand, StatementRange } from './banking.model';
import * as BankingSelectors from './banking.selectors';

@Injectable()
export class BankingFacade {
  readonly #store = inject(Store);

  accounts$ = this.#store.pipe(select(BankingSelectors.selectAccounts));
  openAccounts$ = this.#store.pipe(select(BankingSelectors.selectOpenAccounts));
  accountTotals$ = this.#store.pipe(select(BankingSelectors.selectAccountTotals));
  salaryAccount$ = this.#store.pipe(select(BankingSelectors.selectSalaryAccount));
  banks$ = this.#store.pipe(select(BankingSelectors.selectBanks));
  netWorth$ = this.#store.pipe(select(BankingSelectors.selectNetWorth));
  pending$ = this.#store.pipe(select(BankingSelectors.selectPending));
  accountOverview$ = this.#store.pipe(select(BankingSelectors.selectAccountOverview));
  statementAccountId$ = this.#store.pipe(select(BankingSelectors.selectStatementAccountId));
  statementAccount$ = this.#store.pipe(select(BankingSelectors.selectStatementAccount));
  statementFilter$ = this.#store.pipe(select(BankingSelectors.selectStatementFilter));
  statementFilterActive$ = this.#store.pipe(select(BankingSelectors.selectStatementFilterActive));
  statementWindow$ = this.#store.pipe(select(BankingSelectors.selectStatementWindow));
  statementLoading$ = this.#store.pipe(select(BankingSelectors.selectStatementLoading));
  statementNotFound$ = this.#store.pipe(select(BankingSelectors.selectStatementNotFound));

  account$(accountId: AccountId): Observable<AccountEntry | null> {
    return this.#store.pipe(select(BankingSelectors.selectAccount(accountId)));
  }

  targetAccounts$(sourceId: AccountId): Observable<AccountEntry[]> {
    return this.#store.pipe(select(BankingSelectors.selectTargetAccounts(sourceId)));
  }

  accountsOfBank$(bankId: string): Observable<AccountEntry[]> {
    return this.#store.pipe(select(BankingSelectors.selectAccountsOfBank(bankId)));
  }

  isPending$(command: BankCommand): Observable<boolean> {
    return this.#store.pipe(select(BankingSelectors.selectIsPending(command)));
  }

  openAccount(bankId: string, kind: OpenableAccountKind): void {
    this.#store.dispatch(BankingActions.submittedOpenAccount({ bankId, kind }));
  }

  closeAccount(accountId: AccountId, targetAccountId?: AccountId): void {
    this.#store.dispatch(
      BankingActions.submittedCloseAccount(
        targetAccountId === undefined ? { accountId } : { accountId, targetAccountId },
      ),
    );
  }

  setSalaryAccount(accountId: AccountId): void {
    this.#store.dispatch(BankingActions.submittedSalaryAccount({ accountId }));
  }

  transfer(transfer: TransferPayload): void {
    this.#store.dispatch(BankingActions.submittedTransfer({ transfer }));
  }

  enterAccountStatementPage(): void {
    this.#store.dispatch(BankingActions.enterAccountStatementPage());
  }

  leaveAccountStatementPage(): void {
    this.#store.dispatch(BankingActions.leaveAccountStatementPage());
  }

  selectStatementPeriod(period: StatementPeriod): void {
    this.#store.dispatch(BankingActions.selectedStatementPeriod({ period }));
  }

  selectStatementTypes(types: TransactionType[]): void {
    this.#store.dispatch(BankingActions.selectedStatementTypes({ types }));
  }

  searchStatement(search: string): void {
    this.#store.dispatch(BankingActions.enteredStatementSearch({ search }));
  }

  resetStatementFilter(): void {
    this.#store.dispatch(BankingActions.clickedResetStatementFilter());
  }

  scrollStatement(range: StatementRange): void {
    this.#store.dispatch(BankingActions.scrolledStatement({ range }));
  }
}
