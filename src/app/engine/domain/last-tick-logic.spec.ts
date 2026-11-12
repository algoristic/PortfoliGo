import { lastTickOf, validLastTicks, withLastTick, withoutLastTick } from './last-tick-logic';

// `pgo.lastTick` comes from localStorage and may hold anything (TS §9.3).
describe('last-tick-logic', () => {
  describe('validLastTicks', () => {
    it.each([
      [null, {}],
      [42, {}],
      ['p-a', {}],
      [[1, 2], {}],
      [{ 'p-a': 5_389_921 }, { 'p-a': 5_389_921 }],
      [{ 'p-a': 0 }, { 'p-a': 0 }],
      [{ 'p-a': 7, 'p-b': -1, 'p-c': 1.5, 'p-d': '9', 'p-e': null, 'p-f': 2 ** 53 }, { 'p-a': 7 }],
    ])('keeps the valid ticks of %o', (data, expected) => {
      expect(validLastTicks(data)).toEqual(expected);
    });
  });

  describe('lastTickOf', () => {
    it('returns the tick of the player, or undefined', () => {
      expect(lastTickOf({ 'p-a': 7, 'p-b': 9 }, 'p-b')).toBe(9);
      expect(lastTickOf({ 'p-a': 7 }, 'p-b')).toBeUndefined();
      expect(lastTickOf({ 'p-a': 'x' }, 'p-a')).toBeUndefined();
      expect(lastTickOf({}, 'toString')).toBeUndefined();
      expect(lastTickOf(undefined, 'p-a')).toBeUndefined();
    });
  });

  describe('withLastTick', () => {
    it('sets the tick of the player and keeps the valid entries of the others', () => {
      expect(withLastTick({ 'p-a': 7, 'p-b': 'x' }, 'p-c', 11)).toEqual({ 'p-a': 7, 'p-c': 11 });
      expect(withLastTick({ 'p-a': 7 }, 'p-a', 8)).toEqual({ 'p-a': 8 });
      expect(withLastTick(undefined, 'p-a', 8)).toEqual({ 'p-a': 8 });
    });
  });

  describe('withoutLastTick', () => {
    it('removes the tick of the player and keeps the valid entries of the others', () => {
      expect(withoutLastTick({ 'p-a': 7, 'p-b': 9, 'p-c': 'x' }, 'p-b')).toEqual({ 'p-a': 7 });
      expect(withoutLastTick({ 'p-a': 7 }, 'p-b')).toEqual({ 'p-a': 7 });
      expect(withoutLastTick(undefined, 'p-a')).toEqual({});
    });
  });
});
