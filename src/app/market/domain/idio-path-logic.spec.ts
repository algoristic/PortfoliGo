import fc from 'fast-check';

import {
  decayWeight,
  dividendDrag,
  dividendDragAt,
  expectedLogPath,
  idioVariances,
  transientShockWeights,
  yieldFromDrag,
} from './idio-path-logic';

const HALF_LIFE_15 = Math.LN2 / 15;
const HALF_LIFE_10 = Math.LN2 / 10;
const HALF_LIFE_25 = Math.LN2 / 25;
/** Zero-beta return of the examples in TS §6.4. */
const ZERO_BETA_RETURN = 0.05;

describe('idio-path-logic', () => {
  // TS §6.4 (E-22 new, E-32): v_P = (1 − w)·σ² + λ·(μ_J² + σ_J²) with μ_J = −1 %, v_T = w·σ²,
  // h(t) = (1 − e^{−κ_α·t}) / κ_α, g(t) = (1 − e^{−2θt}) / (2θ) and the expected path
  // m(t) = α·h(t) + (1 − β)·r_z·t − ½·v_P·t − ½·v_T·g(t) with r_z = 5 %: the permanent part with the
  // full compensator, the transient part with the compensator of its return.
  it.each([
    {
      alpha: 0,
      beta: 1,
      vol: 0.2,
      lambda: 0,
      sd: 0.1,
      share: 0,
      theta: 0,
      kappa: 0,
      years: 1,
      vP: 0.04,
      vT: 0,
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
      share: 0,
      theta: 0,
      kappa: 0,
      years: 10,
      vP: 0.0804,
      vT: 0,
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
      share: 0.2,
      theta: HALF_LIFE_15,
      kappa: 0,
      years: 10,
      vP: 0.0724,
      vT: 0.008,
      h: 10,
      g: 6.526209,
      m: -0.188105,
    },
    {
      alpha: 0.02,
      beta: 1,
      vol: 0.2,
      lambda: 4,
      sd: 0.1,
      share: 0.2,
      theta: HALF_LIFE_15,
      kappa: HALF_LIFE_10,
      years: 10,
      vP: 0.0724,
      vT: 0.008,
      h: 7.213475,
      g: 6.526209,
      m: -0.243835,
    },
    {
      alpha: -0.01,
      beta: 1,
      vol: 0.4,
      lambda: 5,
      sd: 0.12,
      share: 0.2,
      theta: HALF_LIFE_15,
      kappa: HALF_LIFE_10,
      years: 100,
      vP: 0.2005,
      vT: 0.032,
      h: 14.412862,
      g: 10.819164,
      m: -10.342235,
    },
    {
      alpha: 0,
      beta: 1,
      vol: 0.3,
      lambda: 2,
      sd: 0.06,
      share: 0.2,
      theta: 0.1,
      kappa: 0,
      years: 50,
      vP: 0.0794,
      vT: 0.018,
      h: 50,
      g: 4.999773,
      m: -2.029998,
    },
    {
      alpha: 0,
      beta: 1.4,
      vol: 0.2,
      lambda: 0,
      sd: 0.1,
      share: 0,
      theta: 0,
      kappa: 0,
      years: 10,
      vP: 0.04,
      vT: 0,
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
      share: 0.2,
      theta: HALF_LIFE_15,
      kappa: HALF_LIFE_10,
      years: 10,
      vP: 0.0724,
      vT: 0.008,
      h: 7.213475,
      g: 6.526209,
      m: -0.043835,
    },
    {
      alpha: -0.01,
      beta: 1.2,
      vol: 0.4,
      lambda: 5,
      sd: 0.12,
      share: 0.2,
      theta: HALF_LIFE_15,
      kappa: HALF_LIFE_10,
      years: 100,
      vP: 0.2005,
      vT: 0.032,
      h: 14.412862,
      g: 10.819164,
      m: -11.342235,
    },
  ])(
    'gives v_P = $vP, v_T = $vT, h = $h, g = $g and m = $m after $years years for β = $beta and w = $share',
    ({ alpha, beta, vol, lambda, sd, share, theta, kappa, years, vP, vT, h, g, m }) => {
      const variances = idioVariances(vol, share, lambda, -0.01, sd);
      const permanent = variances.permanent + variances.jumps;
      const alphaWeight = decayWeight(kappa, years);
      const varianceWeight = decayWeight(2 * theta, years);
      expect(permanent).toBeCloseTo(vP, 6);
      expect(variances.transient).toBeCloseTo(vT, 6);
      expect(alphaWeight).toBeCloseTo(h, 5);
      expect(varianceWeight).toBeCloseTo(g, 5);
      const drift = (1 - beta) * ZERO_BETA_RETURN;
      const path =
        expectedLogPath(alpha, alphaWeight, drift, years, permanent, years) +
        expectedLogPath(0, 0, 0, years, variances.transient, varianceWeight);
      expect(path).toBeCloseTo(m, 5);
    },
  );

  // TS §6.4 (E-22 new): weights of the overnight and the session shock in the transient part.
  it.each([
    { o: 0.25, w: 0.2, overnight: 0.44641016, session: -0.02679492 },
    { o: 0.25, w: 0, overnight: 0, session: 0 },
    { o: 0.25, w: 0.25, overnight: 0.5, session: 0 },
    { o: 0.25, w: 0.5, overnight: 0.6830127, session: 0.1830127 },
    { o: 0.25, w: 1, overnight: 0.5, session: 0.8660254 },
    { o: 0.3, w: 0.2, overnight: 0.44420852, session: -0.05175702 },
  ])(
    'gives the transient weights $overnight / $session for o = $o and w = $w',
    ({ o, w, overnight, session }) => {
      const weights = transientShockWeights(o, w);
      expect(weights.overnight).toBeCloseTo(overnight, 8);
      expect(weights.session).toBeCloseTo(session, 8);
    },
  );

  it('splits the shocks into independent parts with the variances w and 1 − w', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: 1, noNaN: true }),
        fc.double({ min: 0, max: 1, noNaN: true }),
        (o, w) => {
          const { overnight, session } = transientShockWeights(o, w);
          const permanentOvernight = Math.sqrt(o) - overnight;
          const permanentSession = Math.sqrt(1 - o) - session;
          expect(overnight ** 2 + session ** 2).toBeCloseTo(w, 12);
          expect(permanentOvernight ** 2 + permanentSession ** 2).toBeCloseTo(1 - w, 12);
          expect(overnight * permanentOvernight + session * permanentSession).toBeCloseTo(0, 12);
        },
      ),
    );
  });

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

  // TS §6.5 (E-33): ỹ(d) = ỹ_∞ + (ỹ_0 − ỹ_∞)·e^{−κ_y·d} and y = f·(1 − e^{−ỹ/f}), with ỹ_∞ the drag
  // of 2.5 % and κ_y = ln 2 / 25 unless noted.
  it.each([
    {
      f: 1,
      start: 0.061875404,
      longRun: 0.025317808,
      kappa: HALF_LIFE_25,
      d: 0,
      drag: 0.061875404,
      y: 0.06,
    },
    {
      f: 1,
      start: 0.061875404,
      longRun: 0.025317808,
      kappa: HALF_LIFE_25,
      d: 10,
      drag: 0.053023285,
      y: 0.05164207,
    },
    {
      f: 1,
      start: 0.061875404,
      longRun: 0.025317808,
      kappa: HALF_LIFE_25,
      d: 25,
      drag: 0.043596606,
      y: 0.042659935,
    },
    {
      f: 1,
      start: 0.061875404,
      longRun: 0.025317808,
      kappa: HALF_LIFE_25,
      d: 50,
      drag: 0.034457207,
      y: 0.033870318,
    },
    {
      f: 4,
      start: 0.010012521,
      longRun: 0.025078452,
      kappa: HALF_LIFE_25,
      d: 25,
      drag: 0.017545486,
      y: 0.017507062,
    },
    {
      f: 2,
      start: 0,
      longRun: 0.025157564,
      kappa: HALF_LIFE_25,
      d: 10,
      drag: 0.006091696,
      y: 0.006082428,
    },
    {
      f: 2,
      start: 0.040405415,
      longRun: 0.025157564,
      kappa: 0,
      d: 30,
      drag: 0.040405415,
      y: 0.04,
    },
  ])(
    'gives the drag $drag and the yield $y after $d years of payments',
    ({ f, start, longRun, kappa, d, drag, y }) => {
      const current = dividendDragAt(start, longRun, kappa, d);
      expect(current).toBeCloseTo(drag, 8);
      expect(yieldFromDrag(current, f)).toBeCloseTo(y, 8);
    },
  );

  it('approaches the long-run drag in the long run', () => {
    expect(dividendDragAt(0.06, 0.025, HALF_LIFE_25, 2000)).toBeCloseTo(0.025, 12);
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
