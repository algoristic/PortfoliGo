import fc from 'fast-check';

import { GAME_START_TICK } from '@app/clock/domain/calendar-logic';

import { closeInflowMonth, openInflows, recordInflows, startInflows } from './inflow-logic';
import { Account, AccountId, CurrentAccount } from './models/account.model';
import { AccountEventCode, AccountInflows, CoverageState } from './models/household.model';
import { accountEvents, availableAmount, overdraftLimits } from './overdraft-logic';

import { arbCents } from '../../../testing/arbitraries';

const NET_INCOME = 250_000;

function current(sequence: number, bankId: string, closed = false): CurrentAccount {
  return {
    id: `acc-${sequence}`,
    kind: 'current',
    bankId,
    number: String(sequence).padStart(10, '0'),
    openedAt: GAME_START_TICK,
    closedAt: closed ? GAME_START_TICK + 1 : null,
  };
}

function window(accountId: AccountId, salary: [number, number, number]): AccountInflows {
  return { ...openInflows(accountId), salaryWindow: salary };
}

const factorTwo = (): number => 2;

function limits(
  accounts: Account[],
  inflows: AccountInflows[],
  salaryAccountId: AccountId = 'acc-1',
): Record<string, number> {
  return Object.fromEntries(
    overdraftLimits(accounts, inflows, salaryAccountId, factorTwo).map(({ accountId, limit }) => [
      accountId,
      limit,
    ]),
  );
}

/** Pays the salary into `accountId` and closes the month, as the engine does each month. */
function payMonth(inflows: AccountInflows[], accountId: AccountId): AccountInflows[] {
  return closeInflowMonth(
    recordInflows(inflows, {
      type: 'salary',
      postings: [
        { account: accountId, amount: NET_INCOME },
        { account: 'external:employer', amount: -NET_INCOME },
      ],
    }),
  );
}

describe('overdraft-logic', () => {
  describe('overdraftLimits', () => {
    const b1 = current(1, 'b1');
    const b2 = current(2, 'b2');
    const b1Second = current(3, 'b1');

    // TS §7.4: the home bank starts with the full limit; a new salary account takes three months
    it('moves the limit over three months after a change of the salary account', () => {
      const accounts = [b1, b2];
      let inflows = [startInflows('acc-1', NET_INCOME), openInflows('acc-2')];
      expect(limits(accounts, inflows)).toEqual({ 'acc-1': 500_000, 'acc-2': 0 });
      inflows = payMonth(inflows, 'acc-2');
      expect(limits(accounts, inflows, 'acc-2')).toEqual({ 'acc-1': 333_300, 'acc-2': 166_600 });
      inflows = payMonth(inflows, 'acc-2');
      expect(limits(accounts, inflows, 'acc-2')).toEqual({ 'acc-1': 166_600, 'acc-2': 333_300 });
      inflows = payMonth(inflows, 'acc-2');
      expect(limits(accounts, inflows, 'acc-2')).toEqual({ 'acc-1': 0, 'acc-2': 500_000 });
    });

    // TS §7.4: two current accounts at the same bank share one limit
    it('puts the limit of a bank on the account with the most salary', () => {
      const accounts = [b1, b1Second];
      let inflows = [startInflows('acc-1', NET_INCOME), openInflows('acc-3')];
      inflows = payMonth(inflows, 'acc-1');
      inflows = payMonth(inflows, 'acc-3');
      expect(limits(accounts, inflows, 'acc-3')).toEqual({ 'acc-1': 500_000, 'acc-3': 0 });
      inflows = payMonth(inflows, 'acc-3');
      expect(limits(accounts, inflows, 'acc-3')).toEqual({ 'acc-1': 0, 'acc-3': 500_000 });
    });

    it.each<[string, AccountId, Record<string, number>]>([
      ['the salary account', 'acc-3', { 'acc-1': 0, 'acc-3': 333_300 }],
      ['the smaller account number', 'acc-2', { 'acc-1': 333_300, 'acc-3': 0 }],
    ])('breaks a tie in favour of %s', (_case, salaryAccountId, expected) => {
      const inflows = [window('acc-1', [250_000, 0, 0]), window('acc-3', [0, 250_000, 0])];
      expect(limits([b1, b1Second], inflows, salaryAccountId)).toEqual(expected);
    });

    it('breaks a tie by account number regardless of the account order', () => {
      const inflows = [window('acc-1', [250_000, 0, 0]), window('acc-3', [0, 250_000, 0])];
      expect(limits([b1Second, b1], inflows, 'acc-2')).toEqual({ 'acc-3': 0, 'acc-1': 333_300 });
    });

    it('keeps the salary account as carrier when a later account ties', () => {
      const inflows = [window('acc-1', [250_000, 0, 0]), window('acc-3', [0, 250_000, 0])];
      expect(limits([b1Second, b1], inflows, 'acc-3')).toEqual({ 'acc-3': 333_300, 'acc-1': 0 });
    });

    it('grants limits only to current accounts', () => {
      const savings: Account = { ...current(4, 'b1'), kind: 'savings' };
      const clearing: Account = { ...current(5, 'b1'), kind: 'clearing', depotId: 'dep-6' };
      const inflows = [
        startInflows('acc-1', NET_INCOME),
        startInflows('acc-4', NET_INCOME),
        startInflows('acc-5', NET_INCOME),
      ];
      expect(limits([savings, b1, clearing], inflows)).toEqual({ 'acc-1': 500_000 });
    });

    it('counts the salary of closed accounts for the bank', () => {
      const inflows = [startInflows('acc-1', NET_INCOME), openInflows('acc-3')];
      expect(limits([current(1, 'b1', true), b1Second], inflows, 'acc-3')).toEqual({
        'acc-3': 500_000,
      });
    });

    it.each([
      [234_567, 469_100],
      [0, 0],
    ])('rounds the limit for a net income of %d cents down to whole euros', (income, limit) => {
      expect(limits([b1], [startInflows('acc-1', income)])).toEqual({ 'acc-1': limit });
    });

    it('applies the factor of each bank', () => {
      const factors: Record<string, number> = { b1: 1.5, b2: 0 };
      const result = overdraftLimits(
        [b1, b2],
        [startInflows('acc-1', NET_INCOME), startInflows('acc-2', NET_INCOME)],
        'acc-1',
        (bankId) => factors[bankId],
      );
      expect(result).toEqual([
        { accountId: 'acc-1', limit: 375_000 },
        { accountId: 'acc-2', limit: 0 },
      ]);
    });

    it('treats accounts without inflows as without salary', () => {
      expect(limits([b1, b1Second], [startInflows('acc-3', NET_INCOME)], 'acc-1')).toEqual({
        'acc-1': 0,
        'acc-3': 500_000,
      });
    });

    it('grants non-negative limits, at most one per bank, summing to the bank limit', () => {
      const arbAccounts = fc
        .array(fc.tuple(fc.constantFrom('b1', 'b2', 'b3'), fc.boolean()), {
          minLength: 1,
          maxLength: 6,
        })
        .map((specs) => specs.map(([bankId, closed], i) => current(i + 1, bankId, closed)));
      const arbWindow = fc.tuple(
        fc.integer({ min: 0, max: 1e8 }),
        fc.integer({ min: 0, max: 1e8 }),
        fc.integer({ min: 0, max: 1e8 }),
      );
      fc.assert(
        fc.property(
          arbAccounts,
          fc.array(arbWindow, { minLength: 6, maxLength: 6 }),
          fc.integer({ min: 1, max: 6 }),
          (accounts, windows, salarySequence) => {
            const inflows = accounts.map((account, i) => window(account.id, windows[i]));
            const result = overdraftLimits(accounts, inflows, `acc-${salarySequence}`, factorTwo);
            const open = accounts.filter((account) => account.closedAt === null);
            expect(result.map(({ accountId }) => accountId)).toEqual(open.map(({ id }) => id));
            for (const bankId of ['b1', 'b2', 'b3']) {
              const ofBank = result.filter(({ accountId }) =>
                open.some(({ id, bankId: bank }) => id === accountId && bank === bankId),
              );
              expect(ofBank.every(({ limit }) => limit >= 0 && limit % 100 === 0)).toBe(true);
              expect(ofBank.filter(({ limit }) => limit > 0).length).toBeLessThanOrEqual(1);
              const bankSalary = accounts.reduce(
                (sum, account, i) =>
                  account.bankId === bankId ? sum + windows[i].reduce((a, b) => a + b, 0) : sum,
                0,
              );
              const granted = ofBank.reduce((sum, { limit }) => sum + limit, 0);
              const expected = ofBank.length === 0 ? 0 : (2 * bankSalary) / 3;
              expect(granted).toBeLessThanOrEqual(expected + 0.5);
              expect(granted).toBeGreaterThan(expected - 100.5);
            }
          },
        ),
      );
    });
  });

  describe('availableAmount', () => {
    // TS §7.4: available amount for own transfers
    it.each<[string, CoverageState, number]>([
      ['a current account in credit', { balance: 100_000, limit: 500_000 }, 600_000],
      ['a current account in the limit', { balance: -200_000, limit: 500_000 }, 300_000],
      ['a current account beyond the limit', { balance: -600_000, limit: 500_000 }, 0],
      ['a current account without limit', { balance: 30_000, limit: 0 }, 30_000],
      ['a savings account', { balance: 300_000, limit: null }, 300_000],
      ['a negative clearing account', { balance: -1_479, limit: null }, 0],
    ])('offers %s', (_case, state, available) => {
      expect(availableAmount(state)).toBe(available);
    });

    it('is never negative and never more than balance plus limit', () => {
      fc.assert(
        fc.property(arbCents(), fc.option(fc.integer({ min: 0, max: 1e9 })), (balance, limit) => {
          const available = availableAmount({ balance, limit });
          expect(available).toBeGreaterThanOrEqual(0);
          expect(available).toBe(Math.max(0, balance + (limit ?? 0)));
        }),
      );
    });
  });

  describe('accountEvents', () => {
    const exceeded: AccountEventCode = 'overdraft-limit-exceeded';
    const uncovered: AccountEventCode = 'account-uncovered';

    // TS §7.4: events of a balance or limit change
    it.each<[string, [number, number | null], [number, number | null], AccountEventCode[]]>([
      ['turns negative', [10_000, 500_000], [-5_000, 500_000], [uncovered]],
      ['leaves zero', [0, 500_000], [-1, 500_000], [uncovered]],
      ['reaches zero', [10_000, 500_000], [0, 500_000], []],
      ['stays negative', [-5_000, 500_000], [-10_000, 500_000], []],
      ['reaches the limit', [-400_000, 500_000], [-500_000, 500_000], []],
      ['passes the limit', [-400_000, 500_000], [-500_001, 500_000], [exceeded]],
      ['leaves the limit', [-500_000, 500_000], [-500_001, 500_000], [exceeded]],
      ['jumps beyond the limit', [10_000, 500_000], [-600_000, 500_000], [uncovered, exceeded]],
      ['stays beyond the limit', [-600_000, 500_000], [-700_000, 500_000], []],
      ['returns into the limit', [-600_000, 500_000], [-400_000, 500_000], []],
      ['loses limit', [-300_000, 500_000], [-300_000, 166_600], [exceeded]],
      ['loses limit while beyond it', [-600_000, 500_000], [-600_000, 333_300], []],
      ['turns negative without limit', [1_000, 0], [-1_000, 0], [uncovered, exceeded]],
      ['turns negative without overdraft', [500, null], [-300, null], [uncovered]],
      ['stays negative without overdraft', [-300, null], [-500, null], []],
    ])('reports when the balance %s', (_case, [balance, limit], [after, afterLimit], events) => {
      expect(accountEvents({ balance, limit }, { balance: after, limit: afterLimit })).toEqual(
        events,
      );
    });

    it('reports nothing for an unchanged state', () => {
      fc.assert(
        fc.property(arbCents(), fc.option(fc.integer({ min: 0, max: 1e9 })), (balance, limit) => {
          expect(accountEvents({ balance, limit }, { balance, limit })).toEqual([]);
        }),
      );
    });
  });
});
