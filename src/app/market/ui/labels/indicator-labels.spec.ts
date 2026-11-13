import { indicatorLabel } from './indicator-labels';

describe('indicatorLabel', () => {
  it.each([
    [{ kind: 'sma', period: 20 }, 'SMA 20'],
    [{ kind: 'ema', period: 9 }, 'EMA 9'],
    [{ kind: 'smma', period: 14 }, 'SMMA 14'],
    [{ kind: 'bollinger', period: 20, multiplier: 2 }, 'Bollinger 20/2'],
    [{ kind: 'bollinger', period: 50, multiplier: 2.5 }, 'Bollinger 50/2,5'],
  ] as const)('names %o as %s', (spec, label) => {
    expect(indicatorLabel(spec)).toBe(label);
  });
});
