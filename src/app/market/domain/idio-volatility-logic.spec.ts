import fc from 'fast-check';

import { idioVolNormalization, idioVolScale, stationaryPhaseShares } from './idio-volatility-logic';

// TS §6.3 and §6.4 (7.1b-02): phases of the standard market, mean durations 3.5 / 2 / 1 / 0.4 years
// at 261 market days, next-phase weights of the table in §6.3; world factor ξ = 1.45, κ_s = 8.
const DURATIONS = [3.5, 2, 1, 0.4];
const LEAVE = DURATIONS.map((years) => 1 / (years * 261));
const NEXT = [
  [0, 0.35, 0.35, 0.3],
  [0.1, 0, 0.75, 0.15],
  [0.05, 0.15, 0, 0.8],
  [0.45, 0.55, 0, 0],
];
const VOL_RATIOS = [0.074 / 0.093, 1, 0.127 / 0.093, 0.29 / 0.093];
const LOG_VOL_VARIANCE = (1.45 * 1.45) / (2 * 8);

describe('idio-volatility-logic', () => {
  it('gives the stationary phase shares of TS §6.3', () => {
    // Solved exactly with fractions (TS §6.4): 40.16 / 34.86 / 17.09 / 7.89 %.
    const shares = stationaryPhaseShares(LEAVE, NEXT);
    [0.401616, 0.348591, 0.170883, 0.07891].forEach((expected, p) => {
      expect(shares[p]).toBeCloseTo(expected, 6);
    });
  });

  it('weights the jump chain by the mean durations of the phases', () => {
    const shares = stationaryPhaseShares(
      [0.5, 0.25],
      [
        [0, 1],
        [1, 0],
      ],
    );
    // Leaving twice as often halves the time share: 1/3 and 2/3.
    expect(shares[0]).toBeCloseTo(1 / 3, 12);
    expect(shares[1]).toBeCloseTo(2 / 3, 12);
  });

  // TS §6.4: M = Σ_p π_p · r_p^{2φ} · e^{2φ²·V} and the scale √((s / s̄)^{2φ} / M) with s̄ = 9.3 %.
  it.each([
    { coupling: 0.5, normalization: 1.225508, scales: [0.80578, 0.903321, 1.055607, 1.595143] },
    { coupling: 0.25, normalization: 1.063197, scales: [0.915968, 0.969824, 1.048391, 1.288759] },
    { coupling: 1, normalization: 2.196467, scales: [0.536891, 0.674742, 0.921422, 2.104034] },
  ])('normalises φ = $coupling by M = $normalization', ({ coupling, normalization, scales }) => {
    const shares = stationaryPhaseShares(LEAVE, NEXT);
    const value = idioVolNormalization(shares, VOL_RATIOS, LOG_VOL_VARIANCE, coupling);
    expect(value).toBeCloseTo(normalization, 5);
    [0.074, 0.093, 0.127, 0.29].forEach((vol, p) => {
      expect(idioVolScale(vol, 0.093, coupling, value)).toBeCloseTo(scales[p], 5);
    });
  });

  it('leaves the volatility unchanged without coupling, also on a day without world volatility', () => {
    // A fresh market day has world volatility 0; ln 0 would make the power NaN.
    expect(idioVolScale(0, 0.093, 0, 1)).toBe(1);
  });

  it('leaves the volatility unchanged without coupling', () => {
    fc.assert(
      fc.property(fc.double({ min: 0.01, max: 1, noNaN: true }), (vol) => {
        expect(idioVolScale(vol, 0.093, 0, 1)).toBe(1);
        expect(idioVolNormalization([0.5, 0.5], [0.5, 2], 0.2, 0)).toBe(1);
      }),
    );
  });

  it('keeps the mean variance at 1 over the stationary distribution', () => {
    // Property: for any coupling, Σ_p π_p · E[scale²] over the log-normal spread is 1. Checked with
    // a quadrature of the normal distribution of ln s per phase.
    fc.assert(
      fc.property(fc.double({ min: 0, max: 1.5, noNaN: true }), (coupling) => {
        const shares = stationaryPhaseShares(LEAVE, NEXT);
        const m = idioVolNormalization(shares, VOL_RATIOS, LOG_VOL_VARIANCE, coupling);
        const sd = Math.sqrt(LOG_VOL_VARIANCE);
        let total = 0;
        const steps = 2000;
        for (let p = 0; p < shares.length; p++) {
          for (let n = 0; n < steps; n++) {
            const z = -8 + (16 * (n + 0.5)) / steps;
            const density = Math.exp(-0.5 * z * z) / Math.sqrt(2 * Math.PI);
            const vol = 0.093 * VOL_RATIOS[p] * Math.exp(sd * z);
            const scale = idioVolScale(vol, 0.093, coupling, m);
            total += shares[p] * density * (16 / steps) * scale * scale;
          }
        }
        expect(total).toBeCloseTo(1, 6);
      }),
      { numRuns: 20 },
    );
  });
});
