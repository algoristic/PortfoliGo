// Tolerances of statistical tests as multiples of a standard error (TS §14.1). With fixed seeds
// these tests are deterministic; the tolerance only matters when the model or the seed changes.

/** Asserts `|observed − expected| ≤ k · standardError`. */
export function expectWithinSigma(
  observed: number,
  expected: number,
  standardError: number,
  k = 5,
  label = 'value',
): void {
  const tolerance = k * standardError;
  expect(
    Math.abs(observed - expected),
    `${label}: ${observed} differs from ${expected} by more than ${k} standard errors (${tolerance})`,
  ).toBeLessThanOrEqual(tolerance);
}

/** Standard error of a sample mean. */
export function meanSe(standardDeviation: number, n: number): number {
  return standardDeviation / Math.sqrt(n);
}

/** Standard error of an observed share for probability `p` and `n` trials. */
export function binomialSe(p: number, n: number): number {
  return Math.sqrt((p * (1 - p)) / n);
}

/** Standard error of the mean count per period for a Poisson rate `lambda` over `n` periods. */
export function poissonSe(lambda: number, n: number): number {
  return Math.sqrt(lambda / n);
}

/** Standard error of a sample variance of a normal distribution. */
export function varianceSe(variance: number, n: number): number {
  return variance * Math.sqrt(2 / (n - 1));
}
