import { dateTimeToTick } from '@app/clock/domain/calendar-logic';
import { TICKS_PER_DAY } from '@app/clock/domain/models/time.model';

import { bookTransaction } from './ledger-logic';
import { Account, AccountId } from './models/account.model';
import { Balances, Transaction, TransactionDraft } from './models/ledger.model';
import { StatementContext, StatementFilter } from './models/statement.model';
import { mergeJournal, statementPage } from './statement-logic';

import { BUDGETS_MS, expectWithinBudget, medianMs } from '../../../testing/perf';

// Budget of TS §14.3 for the worker side of a statement page (AP 3.4): merging the stored and the
// unsaved transactions and one page over 10,000 transactions of an account, as the host does it.

const COUNT = 10_000;
const UNSAVED = 20;
const PAGE = { offset: 0, limit: 50 };
const START = dateTimeToTick({ year: 2030, month: 4, day: 1 });

function account(id: AccountId, kind: Account['kind'], bankId: string, number: string): Account {
  return { id, kind, bankId, number, openedAt: START, closedAt: null } as Account;
}

const ACCOUNTS = [
  account('acc-1', 'current', 'b1', '0000000001'),
  account('acc-2', 'savings', 'b2', '0000000002'),
];
const CONTEXT: StatementContext = {
  accountId: 'acc-1',
  accounts: ACCOUNTS,
  bankNames: new Map([
    ['b1', 'Hansebank'],
    ['b2', 'Direktbank Süd'],
  ]),
};

/** Salary, living costs, fee and transfers with purposes in turn, about one a day. */
function draft(n: number): TransactionDraft {
  const tick = START + n * TICKS_PER_DAY;
  switch (n % 4) {
    case 0:
      return {
        tick,
        type: 'salary',
        postings: [
          { account: 'acc-1', amount: 280_000 },
          { account: 'external:employer', amount: -280_000 },
        ],
        params: { month: '2030-04' },
      };
    case 1:
      return {
        tick,
        type: 'living-costs',
        postings: [
          { account: 'acc-1', amount: -170_000 - (n % 997) },
          { account: 'external:living-costs', amount: 170_000 + (n % 997) },
        ],
        params: { month: '2030-04' },
      };
    case 2:
      return {
        tick,
        type: 'account-fee',
        postings: [
          { account: 'acc-1', amount: -990 },
          { account: 'external:bank:b1:fees', amount: 990 },
        ],
      };
    default:
      return {
        tick,
        type: 'transfer',
        postings: [
          { account: 'acc-1', amount: -(1_000 + n) },
          { account: 'acc-2', amount: 1_000 + n },
        ],
        params: { purpose: n % 400 === 3 ? `Urlaub ${n}` : `Sparrate ${n}` },
      };
  }
}

describe('statement performance', () => {
  let stored: Transaction[];
  let unsaved: Transaction[];

  beforeAll(() => {
    const balances: Balances = new Map([
      ['acc-1', 0],
      ['acc-2', 0],
    ]);
    const journal = Array.from({ length: COUNT }, (_, n) =>
      bookTransaction(balances, n + 1, draft(n)),
    );
    // The newest are not yet written; a few of them are stored already (a write in flight).
    stored = journal.slice(0, COUNT - UNSAVED / 2);
    unsaved = journal.slice(COUNT - UNSAVED);
  });

  it.each<[string, StatementFilter, number]>([
    ['without a filter', {}, COUNT],
    ['with a search', { search: 'urlaub' }, COUNT / 400],
    ['with a type filter', { types: ['transfer'] }, COUNT / 4],
  ])('answers one page %s within the budget', (name, filter, total) => {
    let result = { total: 0 };
    const ms = medianMs(
      () => {
        result = statementPage(mergeJournal(stored, unsaved), CONTEXT, filter, PAGE);
      },
      9,
      2,
    );
    expect(result.total).toBe(total);
    expectWithinBudget(`statement page ${name}`, ms, BUDGETS_MS.statementPage);
  });
});
