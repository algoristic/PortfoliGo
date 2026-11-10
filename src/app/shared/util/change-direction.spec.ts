import { changeDirection } from './change-direction';

describe('changeDirection', () => {
  it('returns up for positive and down for negative values', () => {
    expect(changeDirection(3)).toBe('up');
    expect(changeDirection(-3)).toBe('down');
  });

  it('returns flat for zero and negative zero', () => {
    expect(changeDirection(0)).toBe('flat');
    expect(changeDirection(-0)).toBe('flat');
  });

  it('returns flat for values that round to zero at the given precision', () => {
    expect(changeDirection(0.004, 2)).toBe('flat');
    expect(changeDirection(-0.004, 2)).toBe('flat');
    expect(changeDirection(0.005, 2)).toBe('up');
    expect(changeDirection(-0.006, 2)).toBe('down');
  });

  it('returns flat for NaN', () => {
    expect(changeDirection(Number.NaN)).toBe('flat');
  });
});
