import { AccountId, AccountKind } from '@app/banking/domain/models/account.model';
import { BankConditions } from '@app/banking/domain/models/bank-conditions.model';
import { StandingOrderView } from '@app/banking/domain/models/standing-order.model';
import { EngineCommandError } from '@app/engine/data-access/service/engine.service';
import { AccountView } from '@app/engine/domain/models/account-view.model';
import { Bank } from '@app/world/domain/models/bank.model';

import { AccountEntry, StandingOrderEntry } from './banking.model';
import {
  selectAccountOverview,
  selectAccounts,
  selectAccountsOfBank,
  selectAccountTotals,
  selectBankComparison,
  selectMonthlyOverview,
  selectOpenAccounts,
  selectOpenCurrentAccounts,
  selectSalaryAccount,
  selectStandingOrders,
  selectStatementNotFound,
  selectTargetAccounts,
  selectUpcomingStandingOrders,
} from './banking.selectors';
import { initialStatementState } from './banking.utils';

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
    reserved: 0,
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

  describe('selectAccountOverview', () => {
    it('puts the salary account first, then sorts by bank name, kind and number', () => {
      const AARE = { id: 'bank-aare', name: 'Aarebank', type: 'direct' } as Bank;
      const second = entry('acc-6', 'current', 0, { bank: HOME });
      const aareSavings = entry('acc-7', 'savings', 0, { bank: AARE });
      const aareCurrent = entry('acc-8', 'current', 0, { bank: AARE });
      const homeNumbered = { ...entry('acc-9', 'savings', 0), number: '0000000000' };
      const { open } = selectAccountOverview.projector([
        SAVINGS,
        aareSavings,
        GIRO,
        homeNumbered,
        second,
        aareCurrent,
        CLEARING,
      ]);
      expect(open.map((account) => account.id)).toEqual([
        'acc-1',
        'acc-8',
        'acc-7',
        'acc-4',
        'acc-6',
        'acc-9',
        'acc-2',
      ]);
    });

    it('lists the closed accounts apart, the last closed first', () => {
      const later = entry('acc-6', 'current', 0, { closedAt: 200 });
      expect(selectAccountOverview.projector([CLOSED, GIRO, later])).toEqual({
        open: [GIRO],
        closed: [later, CLOSED],
      });
    });
  });

  describe('selectStatementNotFound', () => {
    it.each([
      [new EngineCommandError('unknown-account'), true],
      [new EngineCommandError('invalid-command'), true],
      [new EngineCommandError('storage-failed'), false],
      [undefined, false],
    ])('is %s for %s', (error, notFound) => {
      expect(selectStatementNotFound.projector({ ...initialStatementState, error })).toBe(notFound);
    });
  });

  describe('selectOpenCurrentAccounts', () => {
    it('offers the open current accounts in display order', () => {
      const overview = selectAccountOverview.projector([...OPEN, CLOSED]);
      expect(selectOpenCurrentAccounts.projector(overview)).toEqual([GIRO, OVERDRAWN]);
    });
  });

  describe('selectBankComparison', () => {
    const cheap = {
      id: 'b-cheap',
      name: 'Zeta',
      type: 'direct',
      conditions: {
        currentAccount: {
          monthlyFee: 100,
          overdraft: { limitIncomeFactor: 2, rate: 0.08, toleratedSurcharge: 0.04 },
        },
        savingsAccount: null,
        depot: {},
      },
    } as Bank;
    const dear = {
      ...cheap,
      id: 'b-dear',
      name: 'Alpha',
      conditions: {
        ...cheap.conditions,
        currentAccount: {
          monthlyFee: 900,
          overdraft: { limitIncomeFactor: 2, rate: 0.12, toleratedSurcharge: 0.04 },
        },
      },
    } as Bank;

    it('keeps the world order without a sort and sorts by the chosen feature', () => {
      expect(selectBankComparison.projector([dear, cheap], null)).toEqual({
        banks: [dear, cheap],
        sort: null,
      });
      const sort = { key: 'accountFee', direction: 'ascending' } as const;
      expect(selectBankComparison.projector([dear, cheap], sort)?.banks).toEqual([cheap, dear]);
    });

    it('is null while the banks are not loaded', () => {
      expect(selectBankComparison.projector(null, null)).toBeNull();
    });
  });

  describe('selectMonthlyOverview', () => {
    const values = {
      income: 0,
      livingCosts: 0,
      fees: 0,
      creditInterest: 0,
      debitInterest: 0,
      taxes: 0,
      dividends: 0,
      orderFees: 0,
      savingsPlanFees: 0,
      accountFees: 0,
      custodyFees: 0,
      spreadCosts: 0,
      terCosts: 0,
    };

    it('puts the running month first, then the closed months newest first', () => {
      const rows = selectMonthlyOverview.projector({
        closedMonths: [
          { month: { year: 2030, month: 4 }, values },
          { month: { year: 2030, month: 5 }, values },
        ],
        current: { month: { year: 2030, month: 6 }, values },
      });
      expect(rows?.map(({ month, running }) => [month.month, running])).toEqual([
        [6, true],
        [5, false],
        [4, false],
      ]);
    });

    it('is null while the values are not loaded', () => {
      expect(selectMonthlyOverview.projector(null)).toBeNull();
    });
  });

  describe('standing orders', () => {
    function standingOrder(
      id: StandingOrderView['id'],
      nextExecution: number | null,
    ): StandingOrderView {
      return {
        id,
        fromAccountId: 'acc-1',
        toAccountId: 'acc-9',
        amount: 10_000,
        day: 1,
        purpose: '',
        createdAt: 0,
        paused: nextExecution === null,
        handledUpTo: '2030-03',
        nextExecution,
      };
    }

    it('joins the accounts, an unknown one as null', () => {
      const [joined] = selectStandingOrders.projector(
        [standingOrder('so-1', 10)],
        OPEN,
      ) as StandingOrderEntry[];
      expect([joined.from, joined.to]).toEqual([GIRO, null]);
      expect(selectStandingOrders.projector(null, OPEN)).toBeNull();
    });

    it('orders the active ones by next execution, ties in the order they were created', () => {
      const orders = [
        standingOrder('so-1', 300),
        standingOrder('so-2', null),
        standingOrder('so-3', 100),
        standingOrder('so-4', 300),
      ].map((order) => ({ ...order, from: null, to: null }));
      expect(selectUpcomingStandingOrders.projector(orders).map(({ id }) => id)).toEqual([
        'so-3',
        'so-1',
        'so-4',
      ]);
      expect(selectUpcomingStandingOrders.projector(null)).toEqual([]);
    });
  });
});
