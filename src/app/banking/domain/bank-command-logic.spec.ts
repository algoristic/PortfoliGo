import {
  closingBlockers,
  closingTargetError,
  MAX_PURPOSE_LENGTH,
  openAccountError,
  openAccountIdError,
  purposeLength,
  salaryAccountError,
  transferError,
  TransferRequest,
} from './bank-command-logic';
import { Account, OpenableAccountKind } from './models/account.model';
import { BankConditions, DepotConditions } from './models/bank-conditions.model';

const DEPOT: DepotConditions = {
  custodyFee: { kind: 'none' },
  orderFee: { kind: 'free' },
  exchangeFee: 0,
  savingsPlanFee: { kind: 'free' },
  clearingAccountRate: 0,
  clearingAccountDebitRate: 0.09,
  venue: 'exchange',
  spreadMarkup: 0,
  fractionalShares: false,
};
const BRANCH: BankConditions = {
  currentAccount: {
    monthlyFee: 990,
    overdraft: { limitIncomeFactor: 2, rate: 0.11, toleratedSurcharge: 0.04 },
  },
  savingsAccount: { rate: 0.02, payout: 'monthly' },
  depot: DEPOT,
};
const BROKER: BankConditions = { currentAccount: null, savingsAccount: null, depot: DEPOT };
const SAVINGS_ONLY: BankConditions = {
  ...BROKER,
  savingsAccount: { rate: 0.03, payout: 'monthly' },
};

const ACCOUNTS: Account[] = [
  { id: 'acc-1', kind: 'current', bankId: 'b1', number: '1', openedAt: 0, closedAt: null },
  { id: 'acc-2', kind: 'savings', bankId: 'b1', number: '2', openedAt: 0, closedAt: null },
  { id: 'acc-3', kind: 'current', bankId: 'b2', number: '3', openedAt: 0, closedAt: 10 },
  {
    id: 'acc-4',
    kind: 'clearing',
    bankId: 'b3',
    number: '4',
    openedAt: 0,
    closedAt: null,
    depotId: 'dep-5',
  },
];

/** Available amounts of the open accounts, e.g. `acc-1` 1.000 € plus a free limit of 5.000 €. */
const AVAILABLE: Readonly<Record<string, number>> = {
  'acc-1': 600_000,
  'acc-2': 300_000,
  'acc-4': 0,
};

function transfer(fields: Partial<TransferRequest>): TransferRequest {
  return { fromAccountId: 'acc-1', toAccountId: 'acc-2', amount: 100, purpose: '', ...fields };
}

describe('bank-command-logic', () => {
  describe('openAccountError', () => {
    // US-BK-02: account kinds as the bank offers them; every bank keeps depots
    it.each([
      [BRANCH, 'current', null],
      [BRANCH, 'savings', null],
      [BRANCH, 'depot', null],
      [BROKER, 'current', 'account-kind-not-offered'],
      [BROKER, 'savings', 'account-kind-not-offered'],
      [BROKER, 'depot', null],
      [SAVINGS_ONLY, 'current', 'account-kind-not-offered'],
      [SAVINGS_ONLY, 'savings', null],
      [undefined, 'depot', 'unknown-bank'],
    ] as const)('checks %#: %s → %s', (conditions, kind, expected) => {
      expect(openAccountError(conditions, kind as OpenableAccountKind)).toBe(expected);
    });
  });

  describe('openAccountIdError', () => {
    it.each([
      ['acc-1', null],
      ['acc-4', null],
      ['acc-3', 'account-closed'],
      ['acc-9', 'unknown-account'],
      ['dep-5', 'unknown-account'],
    ])('checks %s → %s', (id, expected) => {
      expect(openAccountIdError(ACCOUNTS, id)).toBe(expected);
    });
  });

  describe('salaryAccountError', () => {
    // US-BK-05: exactly one open current account is the salary account
    it.each([
      ['acc-1', null],
      ['acc-2', 'not-a-current-account'],
      ['acc-4', 'not-a-current-account'],
      ['acc-3', 'account-closed'],
      ['acc-9', 'unknown-account'],
    ])('checks %s → %s', (id, expected) => {
      expect(salaryAccountError(ACCOUNTS, id)).toBe(expected);
    });
  });

  describe('purposeLength', () => {
    it.each([
      ['', 0],
      ['Miete', 5],
      ['Überweisung', 11],
      ['😀😀', 2],
    ])('counts %j as %d characters', (purpose, expected) => {
      expect(purposeLength(purpose)).toBe(expected);
    });
  });

  describe('transferError', () => {
    const check = (fields: Partial<TransferRequest>): string | null =>
      transferError(ACCOUNTS, transfer(fields), (account) => AVAILABLE[account.id]);

    // TS §7.4, US-BK-04: up to the available amount, never into the tolerated overdraft
    it.each([
      ['an amount below the available amount', {}, null],
      ['exactly the available amount', { amount: 600_000 }, null],
      ['one cent more than available', { amount: 600_001 }, 'insufficient-funds'],
      [
        'the whole savings balance',
        { fromAccountId: 'acc-2', toAccountId: 'acc-1', amount: 300_000 },
        null,
      ],
      [
        'from an uncovered clearing account',
        { fromAccountId: 'acc-4', amount: 1 },
        'insufficient-funds',
      ],
      ['to a clearing account', { toAccountId: 'acc-4' }, null],
      ['an amount of 0', { amount: 0 }, 'invalid-amount'],
      ['a negative amount', { amount: -100 }, 'invalid-amount'],
      ['a fractional amount', { amount: 100.5 }, 'invalid-amount'],
      ['the same account', { toAccountId: 'acc-1' }, 'same-account'],
      ['a closed source', { fromAccountId: 'acc-3' }, 'account-closed'],
      ['a closed target', { toAccountId: 'acc-3' }, 'account-closed'],
      ['an unknown source', { fromAccountId: 'acc-9' }, 'unknown-account'],
      ['an unknown target', { toAccountId: 'acc-9' }, 'unknown-account'],
      ['a purpose of 140 characters', { purpose: 'x'.repeat(MAX_PURPOSE_LENGTH) }, null],
      ['a purpose of 140 emoji', { purpose: '😀'.repeat(MAX_PURPOSE_LENGTH) }, null],
      ['a purpose of 141 characters', { purpose: 'x'.repeat(141) }, 'purpose-too-long'],
    ] as const)('checks %s', (_label, fields, expected) => {
      expect(check(fields)).toBe(expected);
    });

    it('reports an invalid amount before the purpose and the funds', () => {
      expect(check({ amount: 0, purpose: 'x'.repeat(141) })).toBe('invalid-amount');
      expect(check({ amount: 600_001, purpose: 'x'.repeat(141) })).toBe('purpose-too-long');
    });
  });

  describe('closingBlockers', () => {
    // TS §7.4, US-BK-03; standing orders since AP 5.6a
    it.each([
      [false, true, false, 0, []],
      [false, true, false, 5_000, []],
      [false, true, false, -1, ['negative-balance']],
      [true, true, false, 5_000, ['salary-account']],
      [false, false, false, 0, ['depot-not-empty']],
      [false, true, true, 0, ['standing-orders']],
      [
        true,
        false,
        true,
        -1,
        ['salary-account', 'depot-not-empty', 'standing-orders', 'negative-balance'],
      ],
    ])(
      'salary %s, depot empty %s, standing orders %s, remainder %d → %j',
      (isSalaryAccount, depotEmpty, hasStandingOrders, remainder, expected) => {
        expect(
          closingBlockers({ isSalaryAccount, depotEmpty, hasStandingOrders, remainder }),
        ).toEqual(expected);
      },
    );
  });

  describe('closingTargetError', () => {
    it.each([
      [undefined, 0, null],
      [undefined, 1, 'target-required'],
      ['acc-1', 1, null],
      ['acc-4', 500, null],
      ['acc-1', 0, null],
      ['acc-2', 1, 'invalid-target'],
      ['acc-3', 1, 'invalid-target'],
      ['acc-9', 1, 'invalid-target'],
      ['acc-9', 0, 'invalid-target'],
    ])('closing acc-2 to %s with remainder %d → %s', (target, remainder, expected) => {
      expect(closingTargetError(ACCOUNTS, 'acc-2', target, remainder)).toBe(expected);
    });

    // TS §7.4 (AP 5.2): payouts still due on the account need a target even without remainder
    it.each([
      [undefined, 0, 1, 'target-required'],
      [undefined, 0, 0, null],
      ['acc-1', 0, 1, null],
      ['acc-2', 0, 1, 'invalid-target'],
    ])(
      'closing acc-2 to %s with remainder %d and pending payouts %d → %s',
      (target, remainder, pending, expected) => {
        expect(closingTargetError(ACCOUNTS, 'acc-2', target, remainder, pending)).toBe(expected);
      },
    );
  });
});
