import { BankType } from './models/bank-conditions.model';

/**
 * The bank that becomes a new player's home bank: the first branch bank in world order
 * (TS §5.7, E-14). `undefined` if the world has none; the standard world always has two.
 */
export function findHomeBank<T extends { type: BankType }>(banks: readonly T[]): T | undefined {
  return banks.find((bank) => bank.type === 'branch');
}
