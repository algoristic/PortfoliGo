import fc from 'fast-check';

import {
  closeInflowMonth,
  openInflows,
  recordInflows,
  startInflows,
  windowSalary,
} from './inflow-logic';
import { AccountInflows } from './models/household.model';
import { TransactionDraft } from './models/ledger.model';

type Booking = Pick<TransactionDraft, 'type' | 'postings'>;

const salary = (amount: number, account: `acc-${number}` = 'acc-1'): Booking => ({
  type: 'salary',
  postings: [
    { account, amount },
    { account: 'external:employer', amount: -amount },
  ],
});

describe('inflow-logic', () => {
  describe('startInflows', () => {
    it('fills the window with the net income', () => {
      expect(startInflows('acc-1', 250_000)).toEqual({
        accountId: 'acc-1',
        salaryWindow: [250_000, 250_000, 250_000],
        salaryThisMonth: 0,
        depositsLastMonth: 0,
        depositsThisMonth: 0,
      });
    });
  });

  describe('recordInflows', () => {
    const inflows = [openInflows('acc-1'), openInflows('acc-2')];

    // TS §7.4: only external credits count as deposits; only the salary counts for the limit
    it.each<[string, Booking, Partial<AccountInflows>]>([
      ['a salary', salary(250_000), { salaryThisMonth: 250_000, depositsThisMonth: 250_000 }],
      [
        'the opening balance',
        {
          type: 'opening-balance',
          postings: [
            { account: 'acc-1', amount: 1_000_000 },
            { account: 'external:opening-balance', amount: -1_000_000 },
          ],
        },
        { depositsThisMonth: 1_000_000 },
      ],
      [
        'an own transfer',
        {
          type: 'transfer',
          postings: [
            { account: 'acc-2', amount: -300_000 },
            { account: 'acc-1', amount: 300_000 },
          ],
        },
        {},
      ],
      [
        'credit interest',
        {
          type: 'credit-interest',
          postings: [
            { account: 'acc-1', amount: 548 },
            { account: 'external:bank:b1:interest', amount: -548 },
          ],
        },
        {},
      ],
      [
        'a tax refund',
        {
          type: 'tax-refund',
          postings: [
            { account: 'acc-1', amount: 5_425 },
            { account: 'external:tax-office', amount: -5_425 },
          ],
        },
        {},
      ],
    ])('records %s', (_case, booking, change) => {
      expect(recordInflows(inflows, booking)).toEqual([{ ...inflows[0], ...change }, inflows[1]]);
    });

    it('adds up deposits of the month', () => {
      const result = recordInflows(recordInflows(inflows, salary(100_000)), salary(50_000));
      expect(result[0].salaryThisMonth).toBe(150_000);
      expect(result[0].depositsThisMonth).toBe(150_000);
    });

    it('ignores debits and empty postings of a deposit transaction', () => {
      const booking: Booking = {
        type: 'opening-balance',
        postings: [
          { account: 'acc-1', amount: 1_000 },
          { account: 'acc-9', amount: -400 },
          { account: 'acc-8', amount: 0 },
          { account: 'external:opening-balance', amount: -600 },
        ],
      };
      expect(recordInflows(inflows, booking)[0].depositsThisMonth).toBe(1_000);
    });

    it('throws when a salary credits an untracked account', () => {
      expect(() => recordInflows(inflows, salary(1_000, 'acc-9'))).toThrow(/acc-9/);
    });

    it('leaves its input unchanged', () => {
      const before = structuredClone(inflows);
      recordInflows(inflows, salary(1_000));
      expect(inflows).toEqual(before);
    });
  });

  describe('closeInflowMonth', () => {
    it('shifts the window and the deposits by one month', () => {
      const entry: AccountInflows = {
        accountId: 'acc-1',
        salaryWindow: [1, 2, 3],
        salaryThisMonth: 4,
        depositsLastMonth: 5,
        depositsThisMonth: 6,
      };
      expect(closeInflowMonth([entry])).toEqual([
        {
          accountId: 'acc-1',
          salaryWindow: [2, 3, 4],
          salaryThisMonth: 0,
          depositsLastMonth: 6,
          depositsThisMonth: 0,
        },
      ]);
    });

    it('forgets a salary after three month ends', () => {
      fc.assert(
        fc.property(fc.integer({ min: 1, max: 1e9 }), (amount) => {
          let inflows = recordInflows([openInflows('acc-1')], salary(amount));
          const windows: number[] = [];
          for (let month = 0; month < 4; month++) {
            inflows = closeInflowMonth(inflows);
            windows.push(windowSalary(inflows[0]));
          }
          expect(windows).toEqual([amount, amount, amount, 0]);
        }),
      );
    });
  });
});
