import { PendingDistribution } from '@app/portfolio/domain/models/distribution.model';

import { dividendCalendar } from './dividend-calendar-logic';
import { AnnouncedDividend, WatchedDividend } from './models/upcoming.model';

const NOW = 1_000_000;
const SHARE = 1_000_000;

function announced(partial: Partial<AnnouncedDividend>): AnnouncedDividend {
  return {
    depotId: 'dep-1',
    instrumentId: 'stk-1',
    quantity: 10 * SHARE,
    cents: 85,
    exTick: NOW + 3_000,
    paymentTick: NOW + 6_000,
    ...partial,
  };
}

function pending(partial: Partial<PendingDistribution>): PendingDistribution {
  return {
    kind: 'dividend',
    depotId: 'dep-1',
    instrumentId: 'stk-2',
    accountId: 'acc-2',
    quantity: 4 * SHARE,
    cents: 120,
    amount: 480,
    exTick: NOW - 500,
    paymentTick: NOW + 1_500,
    ...partial,
  };
}

function watched(partial: Partial<WatchedDividend>): WatchedDividend {
  return {
    instrumentId: 'stk-3',
    cents: 40,
    exTick: NOW + 2_000,
    paymentTick: NOW + 5_000,
    ...partial,
  };
}

describe('dividendCalendar', () => {
  // TS §8.1: dividend calendar, example
  it('lists earned payouts, held and watched ex-dates by ex-date', () => {
    expect(
      dividendCalendar(NOW, {
        announcedDividends: [
          announced({}),
          // A second depot with 2,5 shares: 212,5 cents → 213 cents of its own.
          announced({ depotId: 'dep-2', quantity: 2_500_000 }),
        ],
        pendingDistributions: [pending({})],
        watchedDividends: [watched({})],
      }),
    ).toEqual([
      {
        instrumentId: 'stk-2',
        exTick: NOW - 500,
        paymentTick: NOW + 1_500,
        perShare: 120,
        quantity: 4 * SHARE,
        expected: 480,
        earned: true,
      },
      {
        instrumentId: 'stk-3',
        exTick: NOW + 2_000,
        paymentTick: NOW + 5_000,
        perShare: 40,
        quantity: null,
        expected: null,
        earned: false,
      },
      {
        instrumentId: 'stk-1',
        exTick: NOW + 3_000,
        paymentTick: NOW + 6_000,
        perShare: 85,
        quantity: 12_500_000,
        expected: 850 + 213,
        earned: false,
      },
    ]);
  });

  it('leaves out past ex-dates and credited payouts', () => {
    expect(
      dividendCalendar(NOW, {
        announcedDividends: [announced({ exTick: NOW })],
        pendingDistributions: [pending({ paymentTick: NOW })],
        watchedDividends: [watched({ exTick: NOW })],
      }),
    ).toEqual([]);
  });

  it('shows a held instrument once even when it is on the watchlist', () => {
    const entries = dividendCalendar(NOW, {
      announcedDividends: [announced({ instrumentId: 'stk-3', exTick: NOW + 2_000 })],
      pendingDistributions: [],
      watchedDividends: [watched({})],
    });
    expect(entries.map(({ instrumentId, expected }) => [instrumentId, expected])).toEqual([
      ['stk-3', 850],
    ]);
  });

  it('sums earned payouts of several depots per ex-date', () => {
    const entries = dividendCalendar(NOW, {
      announcedDividends: [],
      pendingDistributions: [
        pending({}),
        pending({ instrumentId: 'stk-4', amount: 100 }),
        pending({ depotId: 'dep-2', quantity: SHARE, amount: 120 }),
      ],
      watchedDividends: [],
    });
    expect(
      entries.map(({ instrumentId, quantity, expected }) => [instrumentId, quantity, expected]),
    ).toEqual([
      ['stk-2', 5 * SHARE, 600],
      ['stk-4', 4 * SHARE, 100],
    ]);
  });

  it('orders dates of the same ex-date by instrument', () => {
    const entries = dividendCalendar(NOW, {
      announcedDividends: [],
      pendingDistributions: [],
      watchedDividends: [
        watched({ instrumentId: 'stk-7' }),
        watched({ instrumentId: 'stk-5' }),
        watched({ instrumentId: 'stk-9' }),
      ],
    });
    expect(entries.map(({ instrumentId }) => instrumentId)).toEqual(['stk-5', 'stk-7', 'stk-9']);
  });
});
