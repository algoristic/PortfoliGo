import fc from 'fast-check';

import {
  cumulativeDividendDrag,
  decayWeight,
  dividendDrag,
  dividendDragAt,
  expectedLogPath,
  idioVariance,
  yieldFromDrag,
} from './idio-path-logic';

const HALF_LIFE_15 = Math.LN2 / 15;
const HALF_LIFE_10 = Math.LN2 / 10;
const HALF_LIFE_25 = Math.LN2 / 25;
/** Zero-beta return of the examples in TS §6.4. */
const ZERO_BETA_RETURN = 0.05;

describe('idio-path-logic', () => {
  // TS §6.4 (E-22, E-32): v = σ² + λ·(μ_J² + σ_J²) with μ_J = −1 %, h(t) = (1 − e^{−κ_α·t}) / κ_α,
  // g(t) = (1 − e^{−2θt}) / (2θ), m(t) = α·h(t) + (1 − β)·r_z·t − ½·v·g(t) with r_z = 5 %.
  it.each([
    {
      alpha: 0,
      beta: 1,
      vol: 0.2,
      lambda: 0,
      sd: 0.1,
      theta: 0,
      kappa: 0,
      years: 1,
      v: 0.04,
      h: 1,
      g: 1,
      m: -0.02,
    },
    {
      alpha: 0.02,
      beta: 1,
      vol: 0.2,
      lambda: 4,
      sd: 0.1,
      theta: 0,
      kappa: 0,
      years: 10,
      v: 0.0804,
      h: 10,
      g: 10,
      m: -0.202,
    },
    {
      alpha: 0.02,
      beta: 1,
      vol: 0.2,
      lambda: 4,
      sd: 0.1,
      theta: HALF_LIFE_15,
      kappa: 0,
      years: 10,
      v: 0.0804,
      h: 10,
      g: 6.526209,
      m: -0.062354,
    },
    {
      alpha: 0.02,
      beta: 1,
      vol: 0.2,
      lambda: 4,
      sd: 0.1,
      theta: HALF_LIFE_15,
      kappa: HALF_LIFE_10,
      years: 10,
      v: 0.0804,
      h: 7.213475,
      g: 6.526209,
      m: -0.118084,
    },
    {
      alpha: -0.01,
      beta: 1,
      vol: 0.4,
      lambda: 5,
      sd: 0.12,
      theta: HALF_LIFE_15,
      kappa: HALF_LIFE_10,
      years: 100,
      v: 0.2325,
      h: 14.412862,
      g: 10.819164,
      m: -1.401856,
    },
    {
      alpha: 0,
      beta: 1,
      vol: 0.3,
      lambda: 2,
      sd: 0.06,
      theta: 0.1,
      kappa: 0,
      years: 50,
      v: 0.0974,
      h: 50,
      g: 4.999773,
      m: -0.243489,
    },
    {
      alpha: 0,
      beta: 1.4,
      vol: 0.2,
      lambda: 0,
      sd: 0.1,
      theta: 0,
      kappa: 0,
      years: 10,
      v: 0.04,
      h: 10,
      g: 10,
      m: -0.4,
    },
    {
      alpha: 0.02,
      beta: 0.6,
      vol: 0.2,
      lambda: 4,
      sd: 0.1,
      theta: HALF_LIFE_15,
      kappa: HALF_LIFE_10,
      years: 10,
      v: 0.0804,
      h: 7.213475,
      g: 6.526209,
      m: 0.081916,
    },
    {
      alpha: -0.01,
      beta: 1.2,
      vol: 0.4,
      lambda: 5,
      sd: 0.12,
      theta: HALF_LIFE_15,
      kappa: HALF_LIFE_10,
      years: 100,
      v: 0.2325,
      h: 14.412862,
      g: 10.819164,
      m: -2.401856,
    },
  ])(
    'gives v = $v, h = $h, g = $g and m = $m after $years years for β = $beta',
    ({ alpha, beta, vol, lambda, sd, theta, kappa, years, v, h, g, m }) => {
      const variance = idioVariance(vol, lambda, -0.01, sd);
      const alphaWeight = decayWeight(kappa, years);
      const varianceWeight = decayWeight(2 * theta, years);
      expect(variance).toBeCloseTo(v, 6);
      expect(alphaWeight).toBeCloseTo(h, 5);
      expect(varianceWeight).toBeCloseTo(g, 5);
      const drift = (1 - beta) * ZERO_BETA_RETURN;
      expect(
        expectedLogPath(alpha, alphaWeight, drift, years, variance, varianceWeight),
      ).toBeCloseTo(m, 5);
    },
  );

  it('approaches t for a vanishing rate and 1 / r in the long run', () => {
    expect(decayWeight(1e-9, 20)).toBeCloseTo(20, 5);
    expect(decayWeight(0.2, 1000)).toBeCloseTo(5, 10);
    expect(decayWeight(HALF_LIFE_15, 0)).toBe(0);
  });

  // TS §6.4: ỹ = −f·ln(1 − y/f).
  it.each([
    { y: 0.03, f: 4, drag: 0.030113066 },
    { y: 0.03, f: 1, drag: 0.030459207 },
    { y: 0.07, f: 2, drag: 0.071254355 },
    { y: 0, f: 4, drag: 0 },
    { y: 0.03, f: 0, drag: 0 },
    { y: -0.01, f: 4, drag: 0 },
  ])('gives a dividend drag of $drag for yield $y paid $f times a year', ({ y, f, drag }) => {
    expect(dividendDrag(y, f)).toBeCloseTo(drag, 8);
  });

  // TS §6.5 (E-33): ỹ(d) = ỹ_∞ + (ỹ_0 − ỹ_∞)·e^{−κ_y·d}, D(d) = ỹ_∞·d + (ỹ_0 − ỹ_∞)·(1 − e^{−κ_y·d})/κ_y
  // and y = f·(1 − e^{−ỹ/f}), with ỹ_∞ the drag of 2.5 % and κ_y = ln 2 / 25 unless noted.
  it.each([
    {
      f: 1,
      start: 0.061875404,
      longRun: 0.025317808,
      kappa: HALF_LIFE_25,
      d: 0,
      drag: 0.061875404,
      total: 0,
      y: 0.06,
    },
    {
      f: 1,
      start: 0.061875404,
      longRun: 0.025317808,
      kappa: HALF_LIFE_25,
      d: 10,
      drag: 0.053023285,
      total: 0.572450784,
      y: 0.05164207,
    },
    {
      f: 1,
      start: 0.061875404,
      longRun: 0.025317808,
      kappa: HALF_LIFE_25,
      d: 25,
      drag: 0.043596606,
      total: 1.292213476,
      y: 0.042659935,
    },
    {
      f: 1,
      start: 0.061875404,
      longRun: 0.025317808,
      kappa: HALF_LIFE_25,
      d: 50,
      drag: 0.034457207,
      total: 2.254792813,
      y: 0.033870318,
    },
    {
      f: 4,
      start: 0.010012521,
      longRun: 0.025078452,
      kappa: HALF_LIFE_25,
      d: 25,
      drag: 0.017545486,
      total: 0.355266999,
      y: 0.017507062,
    },
    {
      f: 2,
      start: 0,
      longRun: 0.025157564,
      kappa: HALF_LIFE_25,
      d: 10,
      drag: 0.006091696,
      total: 0.03186416,
      y: 0.006082428,
    },
    {
      f: 2,
      start: 0.040405415,
      longRun: 0.025157564,
      kappa: 0,
      d: 30,
      drag: 0.040405415,
      total: 1.212162439,
      y: 0.04,
    },
  ])(
    'gives the drag $drag, the total $total and the yield $y after $d years of payments',
    ({ f, start, longRun, kappa, d, drag, total, y }) => {
      const current = dividendDragAt(start, longRun, kappa, d);
      expect(current).toBeCloseTo(drag, 8);
      // The inputs are rounded to 9 digits; over 50 years that moves the total by up to 1e-8.
      expect(cumulativeDividendDrag(start, longRun, kappa, d)).toBeCloseTo(total, 7);
      expect(yieldFromDrag(current, f)).toBeCloseTo(y, 8);
    },
  );

  it('accumulates no markdown before the payments start', () => {
    expect(cumulativeDividendDrag(0.03, 0.025, HALF_LIFE_25, 0)).toBe(0);
    expect(cumulativeDividendDrag(0.03, 0.025, HALF_LIFE_25, -3)).toBe(0);
    expect(cumulativeDividendDrag(0.03, 0.025, HALF_LIFE_25, -Infinity)).toBe(0);
  });

  it('approaches the long-run drag and grows by it in the long run', () => {
    expect(dividendDragAt(0.06, 0.025, HALF_LIFE_25, 2000)).toBeCloseTo(0.025, 12);
    const slope =
      cumulativeDividendDrag(0.06, 0.025, HALF_LIFE_25, 2001) -
      cumulativeDividendDrag(0.06, 0.025, HALF_LIFE_25, 2000);
    expect(slope).toBeCloseTo(0.025, 10);
  });

  it('gives no yield without a markdown or without payments', () => {
    expect(yieldFromDrag(0, 4)).toBe(0);
    expect(yieldFromDrag(-0.01, 4)).toBe(0);
    expect(yieldFromDrag(0.03, 0)).toBe(0);
  });

  it('inverts the dividend drag', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 1e-4, max: 0.2, noNaN: true }),
        fc.constantFrom(1, 2, 4),
        (y, f) => {
          expect(yieldFromDrag(dividendDrag(y, f), f)).toBeCloseTo(y, 12);
        },
      ),
    );
  });
});
