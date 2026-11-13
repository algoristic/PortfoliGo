import fc from 'fast-check';

import { MarkReadRequest, NotificationReadState } from './models/notification.model';
import {
  isRead,
  markRead,
  MAX_STORED_NOTIFICATIONS,
  normalizeReadState,
  oldestKeptSeq,
  unreadCount,
} from './read-state-logic';

const state = (readUpTo: number, readSeqs: number[] = []): NotificationReadState => ({
  readUpTo,
  readSeqs,
});

/** Brute force: the read numbers among the kept ones, counted one by one. */
function readSet(read: NotificationReadState, lastSeq: number): Set<number> {
  const oldest = Math.max(1, lastSeq - MAX_STORED_NOTIFICATIONS + 1);
  const result = new Set<number>();
  for (let seq = oldest; seq <= lastSeq; seq++) {
    if (seq <= read.readUpTo || read.readSeqs.includes(seq)) {
      result.add(seq);
    }
  }
  return result;
}

const arbCase = fc.integer({ min: 0, max: 2_500 }).chain((lastSeq) =>
  fc.record({
    lastSeq: fc.constant(lastSeq),
    read: fc
      .record({
        readUpTo: fc.integer({ min: 0, max: lastSeq }),
        readSeqs: fc.uniqueArray(fc.integer({ min: 1, max: Math.max(1, lastSeq) }), {
          maxLength: 30,
        }),
      })
      .map(({ readUpTo, readSeqs }) => ({
        readUpTo,
        readSeqs: readSeqs.filter((seq) => seq > readUpTo && seq <= lastSeq).sort((a, b) => a - b),
      })),
    request: fc.record(
      {
        upTo: fc.integer({ min: 0, max: lastSeq }),
        seqs: fc.array(fc.integer({ min: 1, max: Math.max(1, lastSeq) }), {
          maxLength: lastSeq === 0 ? 0 : 10,
        }),
      },
      { requiredKeys: [] },
    ),
  }),
);

describe('read-state-logic', () => {
  describe('oldestKeptSeq', () => {
    // TS §9.1, §12: at most 1,000 notifications are kept
    it.each([
      [0, 1],
      [1, 1],
      [1_000, 1],
      [1_001, 2],
      [2_500, 1_501],
    ])('keeps from %d on %d', (lastSeq, expected) => {
      expect(oldestKeptSeq(lastSeq)).toBe(expected);
    });
  });

  describe('markRead', () => {
    // TS §12, table "Lesestatus" (newest number 5)
    it.each<[NotificationReadState, MarkReadRequest, NotificationReadState, number]>([
      [state(0), { seqs: [2] }, state(0, [2]), 4],
      [state(0, [2]), { seqs: [1] }, state(2), 3],
      [state(2), { upTo: 5 }, state(5), 0],
      [state(3), { upTo: 1 }, state(3), 2],
      [state(0, [4]), { upTo: 3 }, state(4), 1],
      [state(0, [3]), { upTo: 1, seqs: [5, 2] }, state(3, [5]), 1],
      [state(0), {}, state(0), 5],
      [state(0, [5]), { seqs: [3] }, state(0, [3, 5]), 3],
      [state(0, [3]), { upTo: 3 }, state(3), 2],
    ])('marks %j with %j as %j, %d unread', (before, request, after, unread) => {
      const result = markRead(before, 5, request);
      expect(result).toEqual({ ok: true, state: after });
      if (result.ok) {
        expect(unreadCount(result.state, 5)).toBe(unread);
      }
    });

    it.each<MarkReadRequest>([{ upTo: 6 }, { seqs: [6] }, { seqs: [0] }, { upTo: 1, seqs: [9] }])(
      'rejects %j as unknown-notification',
      (request) => {
        expect(markRead(state(0), 5, request)).toEqual({
          ok: false,
          error: 'unknown-notification',
        });
      },
    );

    it('reads exactly the old read ones plus those of the request', () => {
      fc.assert(
        fc.property(arbCase, ({ lastSeq, read, request }) => {
          const result = markRead(read, lastSeq, request);
          expect(result.ok).toBe(true);
          if (!result.ok) {
            return;
          }
          const expected = readSet(read, lastSeq);
          for (let seq = 1; seq <= (request.upTo ?? 0); seq++) {
            if (seq >= Math.max(1, lastSeq - MAX_STORED_NOTIFICATIONS + 1)) {
              expected.add(seq);
            }
          }
          for (const seq of request.seqs ?? []) {
            if (seq >= Math.max(1, lastSeq - MAX_STORED_NOTIFICATIONS + 1)) {
              expected.add(seq);
            }
          }
          expect(readSet(result.state, lastSeq)).toEqual(expected);
          expect(unreadCount(result.state, lastSeq)).toBe(
            lastSeq - Math.max(0, lastSeq - MAX_STORED_NOTIFICATIONS) - expected.size,
          );
        }),
      );
    });
  });

  describe('normalizeReadState', () => {
    // TS §12, table "Lesestatus": notifications no longer kept count as read
    it.each<[NotificationReadState, number, NotificationReadState, number]>([
      [state(0), 1_000, state(0), 1_000],
      [state(0), 1_001, state(1), 1_000],
      [state(0, [150, 250]), 1_200, state(200, [250]), 999],
      [state(0, [201, 202, 250]), 1_200, state(202, [250]), 997],
    ])('turns %j at %d into %j, %d unread', (before, lastSeq, after, unread) => {
      expect(normalizeReadState(before, lastSeq)).toEqual(after);
      expect(unreadCount(before, lastSeq)).toBe(unread);
    });

    it('keeps the read numbers, at most 999 of them single and ascending after the mark', () => {
      fc.assert(
        fc.property(arbCase, ({ lastSeq, read }) => {
          const normal = normalizeReadState(read, lastSeq);
          expect(readSet(normal, lastSeq)).toEqual(readSet(read, lastSeq));
          expect(normal.readSeqs.length).toBeLessThan(MAX_STORED_NOTIFICATIONS);
          expect(normal.readSeqs).toEqual([...normal.readSeqs].sort((a, b) => a - b));
          expect(normal.readSeqs.every((seq) => seq > normal.readUpTo + 1)).toBe(true);
          expect(normalizeReadState(normal, lastSeq)).toEqual(normal);
        }),
      );
    });
  });

  describe('isRead', () => {
    it('reads the numbers up to the mark and the single ones', () => {
      const read = state(3, [5]);
      expect([1, 2, 3, 4, 5, 6].map((seq) => isRead(read, seq))).toEqual([
        true,
        true,
        true,
        false,
        true,
        false,
      ]);
    });
  });
});
