import { StandingOrderView } from '@app/banking/domain/models/standing-order.model';
import { dateTimeToTick } from '@app/clock/domain/calendar-logic';
import { UpcomingResult } from '@app/engine/data-access/service/engine-service.model';
import { OrderView } from '@app/engine/domain/models/trading-view.model';
import { SavingsPlanView } from '@app/trading/domain/models/savings-plan.model';

import {
  dividendCalendarRows,
  firstStepsOf,
  parseStoredFirstSteps,
  upcomingEntries,
} from './dashboard.utils';

function at(day: number, month: number, hour = 0): number {
  return dateTimeToTick({ year: 2030, month, day, hour });
}

const NAMES = new Map([
  ['acc-1', 'Girokonto 1'],
  ['acc-5', 'Verrechnungskonto 5'],
  ['E', 'Welt-ETF'],
]);

describe('parseStoredFirstSteps', () => {
  it.each<[string, unknown, Record<string, unknown>]>([
    ['nothing', undefined, {}],
    ['a list', [{ hidden: true, banksVisited: true }], {}],
    [
      'valid and invalid entries',
      {
        p1: { hidden: true, banksVisited: false, extra: 1 },
        p2: { hidden: 'yes', banksVisited: true },
        p3: null,
      },
      { p1: { hidden: true, banksVisited: false } },
    ],
  ])('reads %s', (_name, data, expected) => {
    expect(parseStoredFirstSteps(data)).toEqual(expected);
  });

  it('gives a player without an entry the defaults', () => {
    expect(firstStepsOf({}, 'p9')).toEqual({ hidden: false, banksVisited: false });
  });
});

describe('upcomingEntries', () => {
  const result: UpcomingResult = {
    tick: at(22, 4, 10),
    days: 14,
    events: [
      { kind: 'salary', tick: at(30, 4, 6), amount: 250_000, accountId: 'acc-1' },
      { kind: 'living-costs', tick: at(1, 5, 6), amount: 180_000, accountId: 'acc-1' },
    ],
    dividends: [],
  };
  const standingOrder: StandingOrderView = {
    id: 'so-1',
    createdAt: 0,
    paused: false,
    handledUpTo: '2030-04',
    day: 1,
    purpose: '',
    fromAccountId: 'acc-1',
    toAccountId: 'acc-5',
    amount: 30_000,
    nextExecution: at(1, 5, 6),
  };
  const paused: StandingOrderView = {
    ...standingOrder,
    id: 'so-2',
    paused: true,
    nextExecution: null,
  };
  const plan: SavingsPlanView = {
    id: 'sp-1',
    createdAt: 0,
    paused: false,
    handledUpTo: '2030-04',
    day: 7,
    depotId: 'dep-4',
    instrumentId: 'E',
    amount: 25_000,
    nextExecution: at(7, 5, 9),
  };
  const order = (id: string, status: OrderView['status'], expiresAt: number): OrderView =>
    ({ id, status, expiresAt, instrumentId: 'E', depotId: 'dep-4' }) as unknown as OrderView;
  const orders = [order('ord-1', 'open', at(23, 4, 22)), order('ord-2', 'executed', at(24, 4))];

  it('is null before the first query', () => {
    expect(upcomingEntries(null, 0, [], [], [], NAMES, NAMES)).toBeNull();
  });

  it('merges the plans and active orders into the window after now, sorted', () => {
    const entries = upcomingEntries(
      result,
      at(23, 4, 8),
      [standingOrder, paused],
      [plan],
      orders,
      NAMES,
      NAMES,
    );
    expect(entries?.map(({ kind, tick }) => [kind, tick])).toEqual([
      ['order-expiry', at(23, 4, 22)],
      ['salary', at(30, 4, 6)],
      ['living-costs', at(1, 5, 6)],
      ['standing-order', at(1, 5, 6)],
    ]);
    expect(entries?.[3]).toMatchObject({
      amount: 30_000,
      accountName: 'Girokonto 1',
      toAccountName: 'Verrechnungskonto 5',
    });
    expect(entries?.[0].instrumentName).toBe('Welt-ETF');
  });

  it('drops dates that passed since the query', () => {
    const entries = upcomingEntries(result, at(30, 4, 6), [], [], [], NAMES, NAMES);
    expect(entries?.map(({ kind }) => kind)).toEqual(['living-costs']);
  });
});

describe('dividendCalendarRows', () => {
  const result: UpcomingResult = {
    tick: at(22, 4, 10),
    days: 14,
    events: [],
    dividends: [
      {
        instrumentId: 'E',
        exTick: at(22, 4, 9),
        paymentTick: at(24, 4, 6),
        perShare: 335,
        quantity: 7_000_000,
        expected: 2_345,
        earned: true,
      },
      {
        instrumentId: 'A',
        exTick: at(3, 5, 9),
        paymentTick: at(7, 5, 6),
        perShare: 400,
        quantity: null,
        expected: null,
        earned: false,
      },
    ],
  };

  it('gives null before the first query', () => {
    expect(dividendCalendarRows(null, at(22, 4, 10), NAMES)).toBeNull();
  });

  it('names the instruments, the ID without a name', () => {
    const rows = dividendCalendarRows(result, at(22, 4, 10), NAMES);
    expect(rows?.map(({ name, earned }) => [name, earned])).toEqual([
      ['Welt-ETF', true],
      ['A', false],
    ]);
  });

  // An earned payout stays until its payment, an announced date until its ex-date.
  it('drops payouts paid and ex-dates passed since the query', () => {
    expect(dividendCalendarRows(result, at(24, 4, 6), NAMES)?.map(({ name }) => name)).toEqual([
      'A',
    ]);
    expect(dividendCalendarRows(result, at(3, 5, 9), NAMES)).toEqual([]);
  });
});
