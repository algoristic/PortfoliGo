import { findHomeBank } from './home-bank-logic';
import { BankType } from './models/bank-conditions.model';

const bank = (id: string, type: BankType): { id: string; type: BankType } => ({ id, type });

describe('findHomeBank', () => {
  // TS §5.7: the first bank of type `branch` in world order becomes the home bank
  it.each([
    [[bank('a', 'branch'), bank('b', 'branch')], 'a'],
    [[bank('a', 'direct'), bank('b', 'branch'), bank('c', 'branch')], 'b'],
    [[bank('a', 'neo-broker'), bank('b', 'online-broker'), bank('c', 'branch')], 'c'],
    [[bank('a', 'direct'), bank('b', 'online-broker')], undefined],
    [[], undefined],
  ])('picks the home bank of %j', (banks, expected) => {
    expect(findHomeBank(banks)?.id).toBe(expected);
  });
});
