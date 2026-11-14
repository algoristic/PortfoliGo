import { AccountId, AccountKind } from '@app/banking/domain/models/account.model';
import { StatementEntry } from '@app/banking/domain/models/statement.model';

import { AccountEntry, StatementState } from './banking.model';
import {
  isStatementFilterActive,
  standingOrderPreselection,
  statementWindowRequest,
} from './banking.utils';

type LoadedWindow = Pick<StatementState, 'total' | 'offset' | 'entries'>;

function loaded(offset: number, count: number, total = 1_000): LoadedWindow {
  return { total, offset, entries: new Array<StatementEntry>(count).fill({} as StatementEntry) };
}

describe('statementWindowRequest', () => {
  // Pages of 50 rows; 10 rows beyond the rendered ones should be loaded (TS §11.3, AP 3.4).
  it.each([
    [
      'first page before the first reply',
      { total: null, offset: 0, entries: [] } as LoadedWindow,
      [0, 0],
      null,
    ],
    ['rendered rows with spare rows loaded', loaded(0, 50), [0, 12], 'none'],
    ['near the end of the window', loaded(0, 50), [30, 42], [0, 100]],
    ['far down', loaded(0, 50), [512, 524], [450, 150]],
    ['back above the window', loaded(450, 150), [445, 457], [350, 200]],
    ['all rows of a short statement', loaded(0, 7, 7), [0, 7], 'none'],
  ] as const)('%s', (_name, statement, [start, end], expected) => {
    const request = statementWindowRequest(statement, { start, end });
    if (expected === 'none') {
      expect(request).toBeNull();
    } else if (expected === null) {
      expect(request).toEqual({ offset: 0, limit: 50 });
    } else {
      expect(request).toEqual({ offset: expected[0], limit: expected[1] });
    }
  });

  it('reloads a covered window when forced', () => {
    expect(statementWindowRequest(loaded(0, 50), { start: 0, end: 12 }, true)).toEqual({
      offset: 0,
      limit: 100,
    });
  });

  it('asks for at most 200 rows', () => {
    expect(statementWindowRequest(loaded(0, 0), { start: 100, end: 400 })).toEqual({
      offset: 50,
      limit: 200,
    });
  });
});

describe('isStatementFilterActive', () => {
  it.each([
    [{ period: 'all', types: [], search: '' }, false],
    [{ period: 'all', types: [], search: '   ' }, false],
    [{ period: 'this-month', types: [], search: '' }, true],
    [{ period: 'all', types: ['salary'], search: '' }, true],
    [{ period: 'all', types: [], search: 'x' }, true],
  ] as const)('%o is active: %s', (filter, active) => {
    expect(isStatementFilterActive({ ...filter, types: [...filter.types] })).toBe(active);
  });
});

describe('standingOrderPreselection', () => {
  function account(id: AccountId, kind: AccountKind, salaryAccount = false): AccountEntry {
    return { id, kind, salaryAccount } as AccountEntry;
  }

  const GIRO = account('acc-1', 'current', true);
  const SAVINGS = account('acc-2', 'savings');
  const CLEARING = account('acc-3', 'clearing');
  const SECOND_GIRO = account('acc-4', 'current');

  // US-BK-10, E-21: from the salary account to the clearing account of a depot
  it.each<[string, AccountEntry[], AccountId | undefined, string, string]>([
    ['salary account to clearing account', [GIRO, SAVINGS, CLEARING], undefined, 'acc-1', 'acc-3'],
    ['only other account', [GIRO, SAVINGS], undefined, 'acc-1', 'acc-2'],
    ['no clearing account', [GIRO, SAVINGS, SECOND_GIRO], undefined, 'acc-1', ''],
    ['clicked account', [GIRO, SAVINGS, CLEARING], 'acc-2', 'acc-2', ''],
    ['clicked account, one other', [GIRO, SAVINGS], 'acc-2', 'acc-2', 'acc-1'],
    ['unknown clicked account', [GIRO, SAVINGS], 'acc-9', 'acc-1', 'acc-2'],
  ])('preselects %s', (_case, open, fromAccountId, from, to) => {
    expect(standingOrderPreselection(open, fromAccountId)).toEqual({
      fromAccountId: from,
      toAccountId: to,
      amount: null,
      day: '1',
      purpose: '',
    });
  });

  it('needs two open accounts', () => {
    expect(standingOrderPreselection([GIRO])).toBeNull();
    expect(standingOrderPreselection([])).toBeNull();
  });
});
