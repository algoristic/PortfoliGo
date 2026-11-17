import { INEXACT_MATH_FUNCTIONS, withInexactMathTrap } from './inexact-math-trap';

describe('withInexactMathTrap', () => {
  it.each(INEXACT_MATH_FUNCTIONS)('makes Math.%s throw while it runs', (name) => {
    const fn = (): unknown => (Math[name] as (...args: number[]) => number)(0.5, 0.5);
    expect(() => withInexactMathTrap(fn)).toThrow(`Math.${name}`);
  });

  it('restores the functions afterwards, also after an error', () => {
    const exp = Math.exp;
    expect(() =>
      withInexactMathTrap(() => {
        throw new Error('inside');
      }),
    ).toThrow('inside');
    expect(Math.exp).toBe(exp);
    expect(Math.exp(0)).toBe(1);
  });

  it('leaves the exact functions and returns the result', () => {
    expect(withInexactMathTrap(() => Math.sqrt(4) + Math.floor(1.5))).toBe(3);
  });
});
