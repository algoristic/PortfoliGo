import fc from 'fast-check';

import { TASK_ORDER, TaskKind, TaskSpec } from './models/scheduled-task.model';
import { createScheduler, popTask, scheduleTask } from './scheduler';

function spec(kind: TaskKind, exchange = 0): TaskSpec {
  switch (kind) {
    case 'session-open':
      return { kind, exchange, dividends: [] };
    case 'session-close':
      return { kind, exchange };
    default:
      return { kind } as TaskSpec;
  }
}

/** `[minute of the day, kind, exchange]` of a task; all tasks lie on the same day. */
type Row = [number, TaskKind, number];

function popAll(rows: readonly Row[]): Row[] {
  const scheduler = createScheduler();
  for (const [minute, kind, exchange] of rows) {
    scheduleTask(scheduler, minute, spec(kind, exchange));
  }
  const result: Row[] = [];
  for (let task = popTask(scheduler); task !== undefined; task = popTask(scheduler)) {
    result.push([task.tick, task.kind, 'exchange' in task ? task.exchange : 0]);
  }
  return result;
}

describe('scheduler', () => {
  // TS §3.8: order of the scheduler, example table (tasks in insertion order → execution order).
  it.each<[string, Row[], Row[]]>([
    [
      'day change, month end and year end at 00:00 on 01.01.',
      [
        [0, 'year-end', 0],
        [0, 'month-end', 0],
        [0, 'day-change', 0],
      ],
      [
        [0, 'day-change', 0],
        [0, 'month-end', 0],
        [0, 'year-end', 0],
      ],
    ],
    [
      'bank run before an open at the same minute',
      [
        [360, 'session-open', 3],
        [360, 'bank-run', 0],
      ],
      [
        [360, 'bank-run', 0],
        [360, 'session-open', 3],
      ],
    ],
    [
      'an open before a close at the same minute',
      [
        [1050, 'session-close', 2],
        [1050, 'session-open', 9],
      ],
      [
        [1050, 'session-open', 9],
        [1050, 'session-close', 2],
      ],
    ],
    [
      'a close before the order expiry at the same minute',
      [
        [1320, 'order-expiry', 0],
        [1320, 'session-close', 0],
      ],
      [
        [1320, 'session-close', 0],
        [1320, 'order-expiry', 0],
      ],
    ],
    [
      'opens of the same minute in insertion order (world order of the exchanges)',
      [
        [540, 'session-open', 2],
        [540, 'session-open', 3],
        [540, 'session-open', 4],
      ],
      [
        [540, 'session-open', 2],
        [540, 'session-open', 3],
        [540, 'session-open', 4],
      ],
    ],
    [
      'the earlier tick before the higher rank',
      [
        [61, 'day-change', 0],
        [60, 'year-end', 0],
      ],
      [
        [60, 'year-end', 0],
        [61, 'day-change', 0],
      ],
    ],
  ])('runs %s', (_name, rows, expected) => {
    expect(popAll(rows)).toEqual(expected);
  });

  it('returns undefined when empty', () => {
    expect(popTask(createScheduler())).toBeUndefined();
  });

  it('pops in the order of a brute-force reference, stable for equal tick and kind', () => {
    const op = fc.oneof(
      fc.record({
        tick: fc.integer({ min: 0, max: 6 }),
        kind: fc.constantFrom(...TASK_ORDER),
      }),
      fc.constant('pop' as const),
    );
    fc.assert(
      fc.property(fc.array(op, { maxLength: 120 }), (ops) => {
        const scheduler = createScheduler();
        const reference: { tick: number; rank: number; seq: number }[] = [];
        let seq = 0;
        for (const item of ops) {
          if (item === 'pop') {
            let best = -1;
            reference.forEach((entry, n) => {
              const current = reference[best];
              if (
                best < 0 ||
                entry.tick < current.tick ||
                (entry.tick === current.tick && entry.rank < current.rank)
              ) {
                best = n;
              }
            });
            const expected = best < 0 ? undefined : reference.splice(best, 1)[0].seq;
            expect(popTask(scheduler)?.seq).toBe(expected);
          } else {
            scheduleTask(scheduler, item.tick, spec(item.kind));
            reference.push({ tick: item.tick, rank: TASK_ORDER.indexOf(item.kind), seq: seq++ });
          }
        }
        expect(scheduler.heap.length).toBe(reference.length);
      }),
    );
  });
});
