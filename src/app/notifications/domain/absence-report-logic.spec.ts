import fc from 'fast-check';

import {
  bankFeesAccount,
  bankInterestAccount,
  EMPLOYER_ACCOUNT,
  LIVING_COSTS_ACCOUNT,
  TAX_OFFICE_ACCOUNT,
} from '@app/banking/domain/ledger-logic';
import { PostingDraft } from '@app/banking/domain/models/ledger.model';
import { MarketIndex } from '@app/world/domain/models/market-index.model';

import {
  closeAbsence,
  isWarning,
  MAX_REPORT_ORDERS,
  MAX_REPORT_WARNINGS,
  openAbsence,
  reportIndices,
  tallyBookings,
  tallyNotifications,
} from './absence-report-logic';
import { IndexLevel } from './models/absence-report.model';
import {
  GameNotification,
  NOTIFICATION_CODES,
  NotificationCode,
} from './models/notification.model';

type Booking = { postings: PostingDraft[] };

function booking(...postings: [PostingDraft['account'], number][]): Booking {
  return { postings: postings.map(([account, amount]) => ({ account, amount })) };
}

function uncovered(seq: number): GameNotification {
  return {
    seq,
    tick: 1_000 + seq,
    code: 'account-uncovered',
    params: { accountId: 'acc-1', balance: -100, limit: 0 },
  };
}

function interest(seq: number): GameNotification {
  return {
    seq,
    tick: 1_000 + seq,
    code: 'interest-credited',
    params: { accountId: 'acc-2', amount: 300, tax: 79 },
  };
}

const ORDER = { depotId: 'dep-3', instrumentId: 'stk-0001', side: 'buy' } as const;

function executed(seq: number): GameNotification {
  return {
    seq,
    tick: 1_000 + seq,
    code: 'order-executed',
    params: {
      ...ORDER,
      orderId: `ord-${seq}`,
      quantity: 1_000_000,
      price: 50,
      total: 5_090,
      tax: 0,
    },
  };
}

function expired(seq: number): GameNotification {
  return {
    seq,
    tick: 1_000 + seq,
    code: 'order-expired',
    params: { ...ORDER, orderId: `ord-${seq}` },
  };
}

function rejected(seq: number): GameNotification {
  return {
    seq,
    tick: 1_000 + seq,
    code: 'order-rejected',
    params: { ...ORDER, orderId: `ord-${seq}`, reason: 'insufficient-funds' },
  };
}

const WORLD: IndexLevel = { series: 7, id: 'idx-world', name: 'Welt', level: 1_000 };
const EUROPE: IndexLevel = { series: 8, id: 'idx-eu', name: 'Europa', level: 500 };

function index(id: string, kind: MarketIndex['kind']): MarketIndex {
  return {
    id,
    name: id,
    ticker: id,
    kind,
    regionId: null,
    sectorId: null,
    constituents: [],
    weighting: 'free-float-market-cap',
    capWeight: null,
    baseValue: 1_000,
  };
}

describe('absence-report-logic', () => {
  describe('isWarning', () => {
    // TS §12: severities warning and critical
    it('picks the codes of severity warning and above', () => {
      expect(NOTIFICATION_CODES.filter((code) => isWarning(code))).toEqual<NotificationCode[]>([
        'account-uncovered',
        'overdraft-limit-exceeded',
        'standing-order-failed',
        'order-rejected',
        'savings-plan-failed',
        'storage-quota-exceeded',
        'market-checksum-mismatch',
      ]);
    });
  });

  describe('reportIndices', () => {
    it('takes the world indices, then the broad index of each region, in world order', () => {
      const indices = [
        index('eu-lead', 'region-leading'),
        index('eu', 'region-broad'),
        index('world', 'world'),
        index('tech', 'sector'),
        index('us', 'region-broad'),
      ];
      expect(reportIndices(indices)).toEqual([2, 1, 4]);
    });
  });

  describe('closeAbsence', () => {
    // TS §12, example "Abwesenheitsbericht": a month of salary, living costs, a fee and savings
    // interest with its tax, one warning and one interest notification
    it('sums the flows by monthly value category and lists the warnings', () => {
      let tally = openAbsence(100, 1_000_000, [WORLD, EUROPE]);
      tally = tallyBookings(tally, [
        booking(['acc-1', 280_000], [EMPLOYER_ACCOUNT, -280_000]),
        booking(['acc-1', -170_000], [LIVING_COSTS_ACCOUNT, 170_000]),
        booking(['acc-1', -50_000], ['acc-2', 50_000]),
      ]);
      tally = tallyBookings(tally, [
        booking(['acc-1', -1_200], [bankFeesAccount('b1'), 1_200]),
        booking(['acc-2', 300], [bankInterestAccount('b1'), -300]),
        booking(['acc-2', -79], [TAX_OFFICE_ACCOUNT, 79]),
      ]);
      tally = tallyNotifications(tally, [uncovered(1), interest(2)]);
      const report = closeAbsence(tally, 44_740, 1_109_021, [
        { ...EUROPE, level: 450 },
        { ...WORLD, level: 1_100 },
      ]);
      expect(report).toEqual({
        from: 100,
        to: 44_740,
        netWorthBefore: 1_000_000,
        netWorthAfter: 1_109_021,
        flows: {
          income: 280_000,
          livingCosts: 170_000,
          fees: 1_200,
          creditInterest: 300,
          debitInterest: 0,
          taxes: 79,
          dividends: 0,
        },
        bookings: 6,
        notifications: 2,
        warnings: [uncovered(1)],
        warningCount: 1,
        orders: [],
        orderCount: 0,
        indices: [
          { series: 7, id: 'idx-world', name: 'Welt', start: 1_000, end: 1_100 },
          { series: 8, id: 'idx-eu', name: 'Europa', start: 500, end: 450 },
        ],
      });
    });

    it('gives no report when nothing was booked or notified', () => {
      const tally = tallyNotifications(tallyBookings(openAbsence(0, 0, [WORLD]), []), []);
      expect(closeAbsence(tally, 10, 0, [WORLD])).toBeNull();
    });

    it('reports a period with only a notification or only a booking', () => {
      const notified = tallyNotifications(openAbsence(0, 0, []), [interest(1)]);
      expect(closeAbsence(notified, 10, 0, [])?.notifications).toBe(1);
      const booked = tallyBookings(openAbsence(0, 0, []), [booking(['acc-1', -5], ['acc-2', 5])]);
      expect(closeAbsence(booked, 10, 0, [])?.bookings).toBe(1);
    });

    it('lists the newest 50 of 60 warnings and counts all of them', () => {
      let tally = openAbsence(0, 0, []);
      for (let seq = 1; seq <= 60; seq++) {
        tally = tallyNotifications(tally, [uncovered(seq)]);
      }
      const report = closeAbsence(tally, 1, 0, []);
      expect(report?.warningCount).toBe(60);
      expect(report?.warnings.map(({ seq }) => seq)).toEqual(
        Array.from({ length: 50 }, (_, n) => n + 11),
      );
    });

    // US-BN-03: executed orders appear in the report; a rejected one is a warning
    it('lists executed and expired orders and leaves rejected ones to the warnings', () => {
      const tally = tallyNotifications(openAbsence(0, 0, []), [
        executed(1),
        interest(2),
        rejected(3),
        expired(4),
      ]);
      const report = closeAbsence(tally, 1, 0, []);
      expect(report?.orders).toEqual([executed(1), expired(4)]);
      expect(report?.orderCount).toBe(2);
      expect(report?.warnings).toEqual([rejected(3)]);
    });

    it('lists the newest orders up to the limit and counts all of them', () => {
      fc.assert(
        fc.property(
          fc.array(fc.constantFrom('executed', 'expired', 'other'), { maxLength: 130 }),
          (kinds) => {
            let tally = openAbsence(0, 0, []);
            kinds.forEach((kind, n) => {
              const seq = n + 1;
              const make = kind === 'executed' ? executed : kind === 'expired' ? expired : interest;
              tally = tallyNotifications(tally, [make(seq)]);
            });
            const orders = kinds.flatMap((kind, n) => (kind === 'other' ? [] : [n + 1]));
            const report = closeAbsence(tally, 1, 0, []);
            expect(report?.orderCount ?? 0).toBe(orders.length);
            expect((report?.orders ?? []).map(({ seq }) => seq)).toEqual(
              orders.slice(-MAX_REPORT_ORDERS),
            );
          },
        ),
      );
    });

    it('leaves out an index without a level at the end', () => {
      const tally = tallyNotifications(openAbsence(0, 0, [WORLD, EUROPE]), [interest(1)]);
      expect(closeAbsence(tally, 1, 0, [{ ...EUROPE, level: 510 }])?.indices).toEqual([
        { series: 8, id: 'idx-eu', name: 'Europa', start: 500, end: 510 },
      ]);
    });

    it('lists the newest warnings up to the limit and counts all of them', () => {
      fc.assert(
        fc.property(fc.array(fc.boolean(), { maxLength: 130 }), (kinds) => {
          let tally = openAbsence(0, 0, []);
          let seq = 0;
          for (const warning of kinds) {
            seq++;
            tally = tallyNotifications(tally, [warning ? uncovered(seq) : interest(seq)]);
          }
          const warnings = kinds.flatMap((warning, n) => (warning ? [n + 1] : []));
          const report = closeAbsence(tally, 1, 0, []);
          if (kinds.length === 0) {
            expect(report).toBeNull();
            return;
          }
          expect(report?.notifications).toBe(kinds.length);
          expect(report?.warningCount).toBe(warnings.length);
          expect(report?.warnings.map((notification) => notification.seq)).toEqual(
            warnings.slice(-MAX_REPORT_WARNINGS),
          );
        }),
      );
    });
  });
});
