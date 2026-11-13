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
