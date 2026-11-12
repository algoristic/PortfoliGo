import { decayWeight, dividendDrag, expectedLogPath, idioVariance } from './idio-path-logic';

const HALF_LIFE_15 = Math.LN2 / 15;
const HALF_LIFE_10 = Math.LN2 / 10;

describe('idio-path-logic', () => {
  // TS §6.4 (E-22): v = σ² + λ·(μ_J² + σ_J²) with μ_J = −1 %, h(t) = (1 − e^{−κ_α·t}) / κ_α,
  // g(t) = (1 − e^{−2θt}) / (2θ), m(t) = α·h(t) − ½·v·g(t).
  it.each([
    {
      alpha: 0,
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
  ])(
    'gives v = $v, h = $h, g = $g and m = $m after $years years',
    ({ alpha, vol, lambda, sd, theta, kappa, years, v, h, g, m }) => {
      const variance = idioVariance(vol, lambda, -0.01, sd);
      const alphaWeight = decayWeight(kappa, years);
      const varianceWeight = decayWeight(2 * theta, years);
      expect(variance).toBeCloseTo(v, 6);
      expect(alphaWeight).toBeCloseTo(h, 5);
      expect(varianceWeight).toBeCloseTo(g, 5);
      expect(expectedLogPath(alpha, alphaWeight, variance, varianceWeight)).toBeCloseTo(m, 5);
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
});
