import { AccountId, DepotId } from './models/account.model';

const NUMBER_DIGITS = 10;
const MAX_SEQUENCE = 9_999_999_999;

// Accounts and depots share one counter per player, so IDs and numbers never collide (TS §7.2).

export function accountId(sequence: number): AccountId {
  return `acc-${checkedSequence(sequence)}`;
}

export function depotId(sequence: number): DepotId {
  return `dep-${checkedSequence(sequence)}`;
}

/** Account or depot number for display: the sequence with ten digits (`0000000007`). */
export function accountNumber(sequence: number): string {
  return String(checkedSequence(sequence)).padStart(NUMBER_DIGITS, '0');
}

function checkedSequence(sequence: number): number {
  if (!Number.isInteger(sequence) || sequence < 1 || sequence > MAX_SEQUENCE) {
    throw new RangeError(
      `account sequence must be an integer in [1, ${MAX_SEQUENCE}]: ${sequence}`,
    );
  }
  return sequence;
}
