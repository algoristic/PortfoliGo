// NgRx declares injectables that need the JIT compiler outside an Angular build (plain Vitest).
import '@angular/compiler';
import '@angular/localize/init';

import { AccountId } from '@app/banking/domain/models/account.model';
import { StatementEntry } from '@app/banking/domain/models/statement.model';
import { statementRows } from '@app/banking/ui/statement-list/statement-list.utils';
import { dateTimeToTick } from '@app/clock/domain/calendar-logic';
import { TICKS_PER_DAY } from '@app/clock/domain/models/time.model';

import * as BankingActions from './banking.actions';
import { bankingReducer, BankingState, initialBankingState } from './banking.reducer';
import { selectStatementWindow } from './banking.selectors';

import { BUDGETS_MS, expectWithinBudget, medianMs } from '../../../../testing/perf';

// Budget of TS §14.3 for the main thread (AP 3.4): a statement over 10,000 bookings scrolls without
// stutter when each arriving page costs less than 4 ms on the main thread. Measured: the reducer
// takes the page, the selector reads the window, and the list builds its rows (the array of 10,000
// rows and the formatted views of the window), as `StatementListComponent.rows` does.

const TOTAL = 10_000;
const WINDOW = 200;
const START = dateTimeToTick({ year: 2030, month: 4, day: 1 });
const BANK_NAMES = new Map([
  ['b1', 'Hansebank'],
  ['b2', 'Direktbank Süd'],
]);

function entry(n: number): StatementEntry {
  const base = {
    seq: TOTAL - n,
    tick: START + (TOTAL - n) * TICKS_PER_DAY,
    balanceAfter: 500_000 + n,
  };
  switch (n % 4) {
    case 0:
      return {
        ...base,
        type: 'salary',
        amount: 280_000,
        counterparties: [{ kind: 'external', account: 'external:employer', bankId: null }],
        params: { month: '2030-04' },
        refs: {},
      };
    case 1:
      return {
        ...base,
        type: 'credit-interest',
        amount: 548,
        counterparties: [{ kind: 'external', account: 'external:bank:b1:interest', bankId: 'b1' }],
        params: { from: '2030-04', to: '2030-04' },
        refs: {},
      };
    default:
      return {
        ...base,
        type: 'transfer',
        amount: -(1_000 + n),
        counterparties: [
          {
            kind: 'own',
            accountId: 'acc-2' as AccountId,
            accountKind: 'savings',
            bankId: 'b2',
            number: '0000000002',
          },
        ],
        params: { purpose: `Sparrate ${n}` },
        refs: {},
      };
  }
}

describe('statement page on the main thread', () => {
  it('takes a page of 200 rows at 10,000 bookings within the budget', () => {
    const offset = 4_000;
    const entries = Array.from({ length: WINDOW }, (_, i) => entry(offset + i));
    const entered = bankingReducer(initialBankingState, BankingActions.enterAccountStatementPage());
    const generation = entered.statement.generation;
    let rows = 0;
    const ms = medianMs(
      () => {
        const state: BankingState = bankingReducer(
          entered,
          BankingActions.retrievedStatementPage({
            generation,
            offset,
            total: TOTAL,
            entries: [...entries],
          }),
        );
        const window = selectStatementWindow({ banking: state });
        rows = statementRows(window.total ?? 0, window.offset, window.entries, BANK_NAMES).length;
      },
      9,
      3,
    );
    expect(rows).toBe(TOTAL);
    expectWithinBudget(
      'Statement page on the main thread (10,000 bookings)',
      ms,
      BUDGETS_MS.statementPageUi,
    );
  });
});
