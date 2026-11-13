import fc from 'fast-check';

import { GameNotification } from './models/notification.model';
import { mergeNotifications, notificationPage } from './notification-page-logic';

function monthClosed(seq: number, tick: number): GameNotification {
  return {
    seq,
    tick,
    code: 'month-closed',
    params: {
      year: 2030,
      month: 4,
      values: {
        income: 0,
        livingCosts: 0,
        fees: 0,
        creditInterest: 0,
        debitInterest: 0,
        taxes: 0,
        dividends: 0,
      },
    },
  };
}

function uncovered(seq: number, tick: number): GameNotification {
  return {
    seq,
    tick,
    code: 'account-uncovered',
    params: { accountId: 'acc-1', balance: -100, limit: 0 },
  };
}

describe('notification-page-logic', () => {
  describe('mergeNotifications', () => {
    it('lists stored and unsaved by number, each number once as in unsaved', () => {
      const merged = mergeNotifications(
        [monthClosed(1, 10), monthClosed(3, 30)],
        [uncovered(3, 30), monthClosed(2, 20)],
      );
      expect(merged.map(({ seq, code }) => `${seq}:${code}`)).toEqual([
        '1:month-closed',
        '2:month-closed',
        '3:account-uncovered',
      ]);
    });
  });

  describe('notificationPage', () => {
    const list = [
      monthClosed(1, 10),
      uncovered(2, 20),
      monthClosed(3, 30),
      uncovered(4, 40),
      monthClosed(5, 50),
    ];

    it('pages newest first with read state and total', () => {
      const page = notificationPage(
        list,
        { readUpTo: 2, readSeqs: [4] },
        { tick: 100, lastSeq: 5, offset: 1, limit: 2 },
      );
      expect(page.total).toBe(5);
      expect(page.entries.map(({ seq, read }) => [seq, read])).toEqual([
        [4, true],
        [3, false],
      ]);
    });

    it('filters by category (US-BN-01)', () => {
      const page = notificationPage(
        list,
        { readUpTo: 0, readSeqs: [] },
        { tick: 100, lastSeq: 5, category: 'account', offset: 0, limit: 10 },
      );
      expect(page.entries.map(({ seq }) => seq)).toEqual([4, 2]);
      expect(page.total).toBe(2);
    });

    it('leaves out ticks after the query limit (TS §8.2)', () => {
      const page = notificationPage(
        list,
        { readUpTo: 0, readSeqs: [] },
        { tick: 30, lastSeq: 4, offset: 0, limit: 10 },
      );
      expect(page.entries.map(({ seq }) => seq)).toEqual([3, 2, 1]);
    });

    it('leaves out numbers after the newest of the player state', () => {
      const page = notificationPage(
        list,
        { readUpTo: 0, readSeqs: [] },
        { tick: 100, lastSeq: 3, offset: 0, limit: 10 },
      );
      expect(page.entries.map(({ seq }) => seq)).toEqual([3, 2, 1]);
    });

    it('leaves out notifications no longer kept (TS §9.1)', () => {
      const page = notificationPage(
        [monthClosed(1, 1), monthClosed(2, 2), monthClosed(1_001, 3)],
        { readUpTo: 0, readSeqs: [] },
        { tick: 10, lastSeq: 1_001, offset: 0, limit: 10 },
      );
      expect(page.entries.map(({ seq }) => seq)).toEqual([1_001, 2]);
    });

    it('splits the matches into pages without gaps or doubles', () => {
      fc.assert(
        fc.property(fc.integer({ min: 0, max: 5 }), fc.integer({ min: 1, max: 6 }), (n, limit) => {
          const seqs: number[] = [];
          for (let offset = 0; offset < 5; offset += limit) {
            const page = notificationPage(
              list.slice(0, n),
              { readUpTo: 0, readSeqs: [] },
              { tick: 100, lastSeq: 5, offset, limit },
            );
            expect(page.total).toBe(n);
            seqs.push(...page.entries.map(({ seq }) => seq));
          }
          expect(seqs).toEqual(
            list
              .slice(0, n)
              .map(({ seq }) => seq)
              .reverse(),
          );
        }),
      );
    });
  });
});
