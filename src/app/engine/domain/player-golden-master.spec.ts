import {
  computePlayerChecksum,
  PLAYER_CHECKSUM,
  playerChecksum,
  runPlayerScript,
} from './player-golden-master';

// Frozen checksum of the player state (TS §4.6, §15, AP 7.3c, review 7.1a-11): the self-test and
// `e2e/determinism.e2e.ts` compare it in every engine.

describe('runPlayerScript', () => {
  it('reproduces the frozen checksum of the player state', () => {
    expect(
      computePlayerChecksum(),
      'the economic rules or the market changed: update PLAYER_CHECKSUM on purpose (TS §15)',
    ).toBe(PLAYER_CHECKSUM);
  });

  it('covers orders, the savings plan, interest, fees and tax', () => {
    const run = runPlayerScript();
    expect(run.results.every(({ ok }) => ok)).toBe(true);
    const types = new Set(run.transactions.map(({ type }) => type));
    for (const type of ['buy', 'sell', 'credit-interest', 'tax', 'salary', 'living-costs']) {
      expect(types, type).toContain(type);
    }
    expect(run.transactions.some(({ refs }) => refs?.['savingsPlanId'] !== undefined)).toBe(true);
    expect(run.points.at(-1)?.skippedDays).toBe(0);
    expect(run.engine.player.positions.length).toBeGreaterThanOrEqual(2);
  });

  it('depends on the state', () => {
    const run = runPlayerScript();
    const changed = { ...run, points: run.points.slice(1) };
    expect(playerChecksum(changed)).not.toBe(playerChecksum(run));
  });
});
