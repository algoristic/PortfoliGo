import { selectCatchUpRatio, selectStatus } from './session.selectors';

describe('SessionSelectors', () => {
  describe('selectStatus', () => {
    it.each([
      ['idle', {}, 'idle'],
      ['loading', {}, 'loading'],
      ['loading', { 'catch-up': { done: 0, total: 5 } }, 'catching-up'],
      ['loaded', {}, 'ready'],
      ['loaded', { candles: { done: 0, total: 5 }, jump: { done: 1, total: 5 } }, 'ready'],
      ['loaded', { 'catch-up': { done: 1, total: 5 } }, 'catching-up'],
      ['restarting', {}, 'restarting'],
      ['restarting', { 'catch-up': { done: 1, total: 5 } }, 'catching-up'],
      ['locked', { 'catch-up': { done: 1, total: 5 } }, 'locked'],
      ['failed', {}, 'failed'],
    ] as const)('shows the phase %s with %o as %s', (phase, running, status) => {
      expect(selectStatus.projector(phase, running)).toBe(status);
    });
  });

  describe('selectCatchUpRatio', () => {
    it.each([
      [{}, null],
      [{ 'catch-up': { done: 0, total: 0 } }, null],
      [{ 'catch-up': { done: 0, total: 120 } }, 0],
      [{ 'catch-up': { done: 30, total: 120 } }, 0.25],
      [{ 'catch-up': { done: 130, total: 120 } }, 1],
      [{ jump: { done: 30, total: 120 } }, null],
    ])('returns for %o: %s', (running, ratio) => {
      expect(selectCatchUpRatio.projector(running)).toBe(ratio);
    });
  });
});
