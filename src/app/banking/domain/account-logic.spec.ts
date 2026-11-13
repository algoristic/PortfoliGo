import { accountId, accountNumber, depotId } from './account-logic';

describe('account-logic', () => {
  // TS §7.2: one counter per player, ten-digit numbers
  it.each([
    [1, 'acc-1', 'dep-1', '0000000001'],
    [7, 'acc-7', 'dep-7', '0000000007'],
    [1234567890, 'acc-1234567890', 'dep-1234567890', '1234567890'],
  ])('derives the ids and number of sequence %d', (sequence, account, depot, number) => {
    expect(accountId(sequence)).toBe(account);
    expect(depotId(sequence)).toBe(depot);
    expect(accountNumber(sequence)).toBe(number);
  });

  it.each([0, -1, 1.5, 10_000_000_000, Number.NaN])('rejects the sequence %d', (sequence) => {
    expect(() => accountId(sequence)).toThrow(`must be an integer in [1, 9999999999]: ${sequence}`);
    expect(() => depotId(sequence)).toThrow(RangeError);
    expect(() => accountNumber(sequence)).toThrow(RangeError);
  });

  it('accepts the largest ten-digit sequence', () => {
    expect(accountNumber(9_999_999_999)).toBe('9999999999');
  });
});
