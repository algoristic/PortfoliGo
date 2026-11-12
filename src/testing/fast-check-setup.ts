import fc from 'fast-check';

// Locally every run draws a new seed; CI derives `FC_SEED` from the commit so a rerun reproduces
// the same inputs. A failing property prints its seed and path (TS §14.1).
const seed = process.env['FC_SEED'];
const numRuns = process.env['FC_NUM_RUNS'];

fc.configureGlobal({
  ...(seed ? { seed: Number(seed) } : {}),
  ...(numRuns ? { numRuns: Number(numRuns) } : {}),
});
