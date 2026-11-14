import fc from 'fast-check';

import { dateTimeToTick } from '@app/clock/domain/calendar-logic';
import { TICKS_PER_DAY } from '@app/clock/domain/models/time.model';

import {
  MAX_UPCOMING_DAYS,
  UpcomingEvent,
  UpcomingFeeAccount,
  UpcomingInputs,
} from './models/upcoming.model';
import { isInWindow, sortUpcoming, upcoming, upcomingEnd } from './upcoming-logic';

import { arbTick } from '../../../testing/arbitraries';

function at(day: string, time = '00:00'): number {
  const [d, m, y] = day.split('.').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  return dateTimeToTick({ year: y, month: m, day: d, hour, minute });
}

function feeAccount(
  accountId: UpcomingFeeAccount['accountId'],
  fields: Partial<UpcomingFeeAccount> & Pick<UpcomingFeeAccount, 'conditions'>,
): UpcomingFeeAccount {
  return {
    accountId,
    openedAt: at('01.01.2030'),
    depositsLastMonth: 0,
    depositsThisMonth: 0,
    ...fields,
  };
}

// TS §8.1, first example: Mo 22.04.2030 10:00, 14 days.
const APRIL: UpcomingInputs = {
  household: {
    netIncome: 250_000,
    livingCosts: 180_000,
    salaryAccountId: 'acc-1',
    currentAccounts: [
      feeAccount('acc-1', {
        conditions: { monthlyFee: 490, feeWaiver: { minMonthlyDeposits: 100_000 } },
      }),
      feeAccount('acc-2', { openedAt: at('16.04.2030', '11:00'), conditions: { monthlyFee: 300 } }),
      feeAccount('acc-3', {
        depositsThisMonth: 40_000,
        conditions: { monthlyFee: 600, feeWaiver: { minMonthlyDeposits: 50_000 } },
      }),
    ],
    depots: [
      {
        depotId: 'dep-4',
        clearingAccountId: 'acc-5',
        custodyFee: { kind: 'percent-pa', rate: 0.002 },
      },
    ],
  },
  announcedDividends: [
    {
      depotId: 'dep-4',
      instrumentId: 'A',
      quantity: 12_500_000,
      cents: 400,
      exTick: at('03.05.2030', '09:00'),
      paymentTick: at('07.05.2030', '06:00'),
    },
  ],
  pendingDistributions: [
    {
      kind: 'fund-distribution',
      depotId: 'dep-4',
      instrumentId: 'E',
      accountId: 'acc-5',
      quantity: 7_000_000,
      cents: 335,
      amount: 2_345,
      exTick: at('22.04.2030', '09:00'),
      paymentTick: at('24.04.2030', '06:00'),
    },
  ],
  watchedDividends: [],
};

// TS §8.1, second example: Mo 01.07.2030 05:59, 3 days.
const JULY: UpcomingInputs = {
  household: {
    netIncome: 0,
    livingCosts: 180_000,
    salaryAccountId: 'acc-1',
    currentAccounts: [
      feeAccount('acc-1', {
        depositsLastMonth: 90_000,
        conditions: { monthlyFee: 490, feeWaiver: { minMonthlyDeposits: 100_000 } },
      }),
      feeAccount('acc-2', {
        depositsLastMonth: 250_000,
        conditions: { monthlyFee: 490, feeWaiver: { minMonthlyDeposits: 100_000 } },
      }),
    ],
    depots: [
      { depotId: 'dep-3', clearingAccountId: 'acc-4', custodyFee: { kind: 'none' } },
      {
        depotId: 'dep-5',
        clearingAccountId: 'acc-6',
        custodyFee: { kind: 'flat-pa', amount: 2_400 },
      },
    ],
  },
  announcedDividends: [],
  pendingDistributions: [],
  watchedDividends: [],
};

describe('upcoming', () => {
  // TS §8.1: salary and living costs as base amounts, account fees of April (waived by the salary
  // the window still credits, pro rata for 15 days, in full below the waiver), an announced ex-date
  // with its amount per share; its payment on 07.05. lies after the window, no custody fee in May.
  it('lists the plannable dates of the April example in order', () => {
    expect(upcoming(at('22.04.2030', '10:00'), 14, APRIL)).toEqual<UpcomingEvent[]>([
      {
        kind: 'dividend-payment',
        tick: at('24.04.2030', '06:00'),
        amount: 2_345,
        accountId: 'acc-5',
        depotId: 'dep-4',
        instrumentId: 'E',
      },
      { kind: 'salary', tick: at('30.04.2030', '06:00'), amount: 250_000, accountId: 'acc-1' },
      {
        kind: 'living-costs',
        tick: at('01.05.2030', '06:00'),
        amount: 180_000,
        accountId: 'acc-1',
      },
      { kind: 'account-fee', tick: at('01.05.2030', '06:00'), amount: 150, accountId: 'acc-2' },
      { kind: 'account-fee', tick: at('01.05.2030', '06:00'), amount: 600, accountId: 'acc-3' },
      {
        kind: 'ex-dividend',
        tick: at('03.05.2030', '09:00'),
        amount: null,
        perShare: 400,
        depotId: 'dep-4',
        instrumentId: 'A',
      },
    ]);
  });

  it('adds the payment of an announced ex-date once the window reaches it', () => {
    const events = upcoming(at('22.04.2030', '10:00'), 15, APRIL);
    // 12,5 shares × 4,00 €
    expect(events.at(-1)).toEqual<UpcomingEvent>({
      kind: 'dividend-payment',
      tick: at('07.05.2030', '06:00'),
      amount: 5_000,
      depotId: 'dep-4',
      instrumentId: 'A',
    });
  });

  // TS §8.1: the fee of June follows last month's deposits; the custody fee of the past quarter
  // has no amount and only for a depot whose bank charges one; no salary without income.
  it('lists the quarter start of the July example', () => {
    expect(upcoming(at('01.07.2030', '05:59'), 3, JULY)).toEqual<UpcomingEvent[]>([
      {
        kind: 'living-costs',
        tick: at('01.07.2030', '06:00'),
        amount: 180_000,
        accountId: 'acc-1',
      },
      { kind: 'account-fee', tick: at('01.07.2030', '06:00'), amount: 490, accountId: 'acc-1' },
      {
        kind: 'custody-fee',
        tick: at('01.07.2030', '06:00'),
        amount: null,
        accountId: 'acc-6',
        depotId: 'dep-5',
      },
    ]);
  });

  it('leaves out a bank run at the very tick of the query', () => {
    expect(upcoming(at('01.07.2030', '06:00'), 3, JULY)).toEqual([]);
  });

  it('keeps every date in the window, sorted, with at most one salary and living costs', () => {
    fc.assert(
      fc.property(arbTick(), fc.integer({ min: 0, max: MAX_UPCOMING_DAYS }), (from, days) => {
        const events = upcoming(from, days, APRIL);
        const end = from + days * TICKS_PER_DAY;
        for (const event of events) {
          expect(isInWindow(event.tick, from, end)).toBe(true);
        }
        expect(sortUpcoming(events)).toEqual(events);
        expect(events.filter(({ kind }) => kind === 'salary').length).toBeLessThanOrEqual(1);
        expect(events.filter(({ kind }) => kind === 'living-costs').length).toBeLessThanOrEqual(1);
        expect(
          events.filter(({ kind }) => kind === 'living-costs').every((e) => e.amount === 180_000),
        ).toBe(true);
      }),
    );
  });
});

describe('upcomingEnd', () => {
  it.each([
    [14, 14],
    [0, 0],
    [-3, 0],
    [40, MAX_UPCOMING_DAYS],
  ])('looks %d days ahead as %d days', (days, expected) => {
    expect(upcomingEnd(1_000, days)).toBe(1_000 + expected * TICKS_PER_DAY);
  });
});

describe('sortUpcoming', () => {
  it('orders equal ticks by kind and keeps the order of equal kinds', () => {
    const tick = at('01.05.2030', '06:00');
    const events: UpcomingEvent[] = [
      { kind: 'standing-order', tick, amount: 1, sourceId: 'so-1' },
      { kind: 'account-fee', tick, amount: 2, accountId: 'acc-2' },
      { kind: 'standing-order', tick, amount: 3, sourceId: 'so-2' },
      { kind: 'salary', tick: tick - 1, amount: 4 },
    ];
    expect(sortUpcoming(events).map(({ amount }) => amount)).toEqual([4, 2, 1, 3]);
  });
});
