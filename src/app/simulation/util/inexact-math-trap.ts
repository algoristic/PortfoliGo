/**
 * `Math` functions whose results ECMAScript leaves to the engine (TS §4.4), plus `random`. Same list
 * as the determinism rule in `eslint.config.js`.
 */
export const INEXACT_MATH_FUNCTIONS = [
  'random',
  'exp',
  'expm1',
  'log',
  'log1p',
  'log2',
  'log10',
  'pow',
  'sin',
  'cos',
  'tan',
  'asin',
  'acos',
  'atan',
  'atan2',
  'sinh',
  'cosh',
  'tanh',
  'asinh',
  'acosh',
  'atanh',
  'cbrt',
  'hypot',
] as const;

/**
 * Runs `run` while every function of `INEXACT_MATH_FUNCTIONS` throws, and restores them afterwards
 * (AP 7.3a, TS §4.4). V8 computes `Math.exp`/`Math.log` bit-identically to `detExp`/`detLog`, so
 * only a trap shows that a checked path calls them; the golden master runs inside it in the logic
 * tests and in the self-test of every engine. Synchronous only: nothing else may run meanwhile.
 */
export function withInexactMathTrap<T>(run: () => T): T {
  // The trap replaces the functions on the global object itself, so it needs `Math` as a value.
  // eslint-disable-next-line no-restricted-syntax -- see above
  const math = Math as unknown as Record<string, unknown>;
  const originals = INEXACT_MATH_FUNCTIONS.map((name) => math[name]);
  for (const name of INEXACT_MATH_FUNCTIONS) {
    math[name] = (): never => {
      throw new Error(`Math.${name} is not deterministic across engines: use detExp/detLog`);
    };
  }
  try {
    return run();
  } finally {
    INEXACT_MATH_FUNCTIONS.forEach((name, i) => {
      math[name] = originals[i];
    });
  }
}
