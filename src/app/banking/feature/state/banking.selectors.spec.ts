import { AccountId, AccountKind } from '@app/banking/domain/models/account.model';
import { BankConditions } from '@app/banking/domain/models/bank-conditions.model';
import { AccountView } from '@app/engine/domain/models/account-view.model';
import { Bank } from '@app/world/domain/models/bank.model';

import { AccountEntry } from './banking.model';
import {
  selectAccounts,
  selectAccountsOfBank,
  selectAccountTotals,
  selectOpenAccounts,
  selectSalaryAccount,
  selectTargetAccounts,
} from './banking.selectors';

const HOME = { id: 'bank-home', name: 'Hausbank', type: 'branch' } as Bank;
const BROKER = {
  id: 'bank-broker',
  name: 'Broker',
  type: 'neo-broker',
  conditions: {} as BankConditions,
} as Bank;

function entry(
  id: AccountId,
  kind: AccountKind,
  balance: number,
  options: { bank?: Bank; closedAt?: number; salaryAccount?: boolean } = {},
): AccountEntry {
  const bank = options.bank ?? HOME;
  return {
    id,
    kind,
    bankId: bank.id,
    number: '0000000001',
    depot: null,
    openedAt: 0,
    closedAt: options.closedAt ?? null,
    balance,
    overdraftLimit: null,
    available: balance,
    salaryAccount: options.salaryAccount ?? false,
    bank,
  };
}

const GIRO = entry('acc-1', 'current', 250_000, { salaryAccount: true });
const SAVINGS = entry('acc-2', 'savings', 1_000_000);
const OVERDRAWN = entry('acc-3', 'current', -12_345);
const CLEARING = entry('acc-4', 'clearing', 50_000, { bank: BROKER });
const CLOSED = entry('acc-5', 'savings', 0, { closedAt: 100 });
const OPEN = [GIRO, SAVINGS, OVERDRAWN, CLEARING];

describe('banking selectors', () => {
  describe('selectAccounts', () => {
    it('adds the bank to every account and leaves it null while the banks are not loaded', () => {
      const { bank: _bank, ...view } = CLEARING;
      const views: AccountView[] = [view];
      expect(selectAccounts.projector(views, [HOME, BROKER])).toEqual([CLEARING]);
      expect(selectAccounts.projector(views, null)).toEqual([{ ...view, bank: null }]);
    });
  });

  describe('selectAccountTotals', () => {
    it('sums the balances of the open accounts per kind, negative balances included', () => {
      expect(selectAccountTotals.projector(OPEN)).toEqual({
        byKind: { current: 237_655, savings: 1_000_000, clearing: 50_000 },
        total: 1_287_655,
      });
    });
  });

  describe('selectSalaryAccount', () => {
    it('finds the salary account, or null before the first projection', () => {
      expect(selectSalaryAccount.projector(OPEN)).toBe(GIRO);
      expect(selectSalaryAccount.projector([])).toBeNull();
    });
  });

  describe('selectTargetAccounts', () => {
    it('offers every open account except the source', () => {
      expect(selectTargetAccounts('acc-2').projector(OPEN)).toEqual([GIRO, OVERDRAWN, CLEARING]);
      expect(selectTargetAccounts('acc-9').projector(OPEN)).toEqual(OPEN);
    });
  });

  describe('selectAccountsOfBank', () => {
    it('lists the open accounts at the bank', () => {
      expect(selectAccountsOfBank('bank-broker').projector(OPEN)).toEqual([CLEARING]);
      expect(selectAccountsOfBank('bank-other').projector(OPEN)).toEqual([]);
    });
  });

  describe('selectOpenAccounts', () => {
    it('leaves closed accounts out', () => {
      expect(selectOpenAccounts.projector([GIRO, CLOSED])).toEqual([GIRO]);
    });
  });
});
