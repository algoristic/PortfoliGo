import {
  NO_WORKER_FAILURES,
  recordWorkerFailure,
  recordWorkerProgress,
  WorkerFailureHistory,
} from './worker-restart-logic';

describe('worker-restart-logic', () => {
  describe('recordWorkerFailure', () => {
    // TS §8.5: decision table of the restarts (history before, failure, decision)
    it.each<[string, WorkerFailureHistory, number, number | null, boolean, WorkerFailureHistory]>([
      ['first failure', NO_WORKER_FAILURES, 0, 100, true, { inRow: 1, tick: 100, recentMs: [0] }],
      [
        'second at the same place',
        { inRow: 1, tick: 100, recentMs: [0] },
        10_000,
        100,
        true,
        { inRow: 2, tick: 100, recentMs: [0, 10_000] },
      ],
      [
        'third at the same place',
        { inRow: 2, tick: 100, recentMs: [0, 10_000] },
        20_000,
        100,
        false,
        { inRow: 3, tick: 100, recentMs: [0, 10_000, 20_000] },
      ],
      [
        'third at the same place, hours apart',
        { inRow: 2, tick: 100, recentMs: [] },
        7_200_000,
        100,
        false,
        { inRow: 3, tick: 100, recentMs: [7_200_000] },
      ],
      [
        'third within a minute after game time moved on',
        { inRow: 0, tick: null, recentMs: [0, 10_000] },
        59_999,
        5_000,
        false,
        { inRow: 1, tick: 5_000, recentMs: [0, 10_000, 59_999] },
      ],
      [
        'third after a minute after game time moved on',
        { inRow: 0, tick: null, recentMs: [0, 10_000] },
        60_000,
        5_000,
        true,
        { inRow: 1, tick: 5_000, recentMs: [10_000, 60_000] },
      ],
      [
        'failure before any clock event',
        NO_WORKER_FAILURES,
        0,
        null,
        true,
        { inRow: 1, tick: null, recentMs: [0] },
      ],
    ])('%s', (_case, history, atMs, lastTick, restart, after) => {
      expect(recordWorkerFailure(history, { atMs, lastTick })).toEqual({
        history: after,
        restart,
      });
    });

    it('never restarts more than twice in a row without progress, however slow', () => {
      let history = NO_WORKER_FAILURES;
      const decisions: boolean[] = [];
      for (let failure = 0; failure < 5; failure++) {
        const decision = recordWorkerFailure(history, { atMs: failure * 3_600_000, lastTick: 7 });
        history = decision.history;
        decisions.push(decision.restart);
      }
      expect(decisions).toEqual([true, true, false, false, false]);
    });
  });

  describe('recordWorkerProgress', () => {
    const failed: WorkerFailureHistory = { inRow: 2, tick: 100, recentMs: [0, 10_000] };

    it('ends the row with a tick beyond the failure and keeps the window', () => {
      expect(recordWorkerProgress(failed, 101)).toEqual({
        inRow: 0,
        tick: null,
        recentMs: [0, 10_000],
      });
    });

    it.each([99, 100])('keeps the row at tick %d', (tick) => {
      expect(recordWorkerProgress(failed, tick)).toBe(failed);
    });

    it('keeps a row that began before any clock event', () => {
      const early: WorkerFailureHistory = { inRow: 1, tick: null, recentMs: [0] };
      expect(recordWorkerProgress(early, 5_000)).toBe(early);
    });

    it('keeps a history without failures', () => {
      expect(recordWorkerProgress(NO_WORKER_FAILURES, 5_000)).toBe(NO_WORKER_FAILURES);
    });
  });
});
