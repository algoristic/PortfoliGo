import { storageFailureResponse } from './storage-failure-logic';

describe('storageFailureResponse', () => {
  // TS §9.5: answer of the host to a failed write
  it.each([
    [false, false, 'retry-later'],
    [false, true, 'retry-later'],
    [true, false, 'drop-candles'],
    [true, true, 'storage-full'],
  ] as const)('answers quota %s, candles dropped %s with %s', (quota, dropped, expected) => {
    expect(storageFailureResponse(quota, dropped)).toBe(expected);
  });
});
