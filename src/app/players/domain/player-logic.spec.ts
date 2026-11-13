import fc from 'fast-check';

import { SCHEMA_VERSION, SIM_VERSION } from '@app/engine/domain/version';

import { NewPlayer, PlayerListEntry, PlayerProfile } from './models/player.model';
import {
  DEFAULT_START_CONDITIONS,
  LIVING_COSTS_RANGE,
  NET_INCOME_RANGE,
  PLAYER_PRESETS,
  START_CAPITAL_RANGE,
} from './player-limits';
import {
  amountRangeError,
  createPlayerProfile,
  isOutdated,
  livingCostsExceedIncome,
  matchingPreset,
  playerNameError,
  playerSeedError,
  sortPlayerList,
  toPlayerListEntry,
} from './player-logic';

const NEW_PLAYER: NewPlayer = {
  name: '  Anna  ',
  seed: '  Kupfer-Falke-731 ',
  start: { startCapital: 1_000_000, netIncome: 250_000, livingCosts: 180_000 },
};

function profile(overrides: Partial<PlayerProfile> = {}): PlayerProfile {
  return {
    ...createPlayerProfile(NEW_PLAYER, 'p1', 1_000),
    ...overrides,
  };
}

describe('player-logic', () => {
  describe('playerNameError', () => {
    // PS US-SP-01: the name is required and has 1–40 characters
    it.each([
      ['Anna', null],
      ['A', null],
      ['x'.repeat(40), null],
      [`  ${'x'.repeat(40)}  `, null],
      ['😀'.repeat(40), null],
      ['x'.repeat(41), 'too-long'],
      ['😀'.repeat(41), 'too-long'],
      ['', 'required'],
      ['   ', 'required'],
    ])('checks %j: %s', (name, expected) => {
      expect(playerNameError(name)).toBe(expected);
    });
  });

  describe('playerSeedError', () => {
    // TS §4.1: the seed is free text, normalised by trimming
    it.each([
      ['kupfer-falke-731', null],
      ['  X ', null],
      ['', 'required'],
      [' \t ', 'required'],
    ])('checks %j: %s', (seed, expected) => {
      expect(playerSeedError(seed)).toBe(expected);
    });
  });

  describe('amountRangeError', () => {
    // PS US-SP-01: start capital 0–1.000.000 €, net income and living costs 0–50.000 € per month
    it.each([
      ['start capital', START_CAPITAL_RANGE, 0, null],
      ['start capital', START_CAPITAL_RANGE, 100_000_000, null],
      ['start capital', START_CAPITAL_RANGE, 100_000_001, 'too-large'],
      ['start capital', START_CAPITAL_RANGE, -1, 'too-small'],
      ['net income', NET_INCOME_RANGE, 0, null],
      ['net income', NET_INCOME_RANGE, 5_000_000, null],
      ['net income', NET_INCOME_RANGE, 5_000_001, 'too-large'],
      ['net income', NET_INCOME_RANGE, -1, 'too-small'],
      ['living costs', LIVING_COSTS_RANGE, 0, null],
      ['living costs', LIVING_COSTS_RANGE, 5_000_000, null],
      ['living costs', LIVING_COSTS_RANGE, 5_000_001, 'too-large'],
      ['living costs', LIVING_COSTS_RANGE, -1, 'too-small'],
      ['net income', NET_INCOME_RANGE, null, 'required'],
      ['net income', NET_INCOME_RANGE, 0.5, 'not-whole-cents'],
      ['net income', NET_INCOME_RANGE, Number.NaN, 'not-whole-cents'],
    ] as const)('checks %s %d: %s', (_label, range, cents, expected) => {
      expect(amountRangeError(cents, range)).toBe(expected);
    });
  });

  describe('defaults and presets', () => {
    // PS US-SP-01: Studium 2.000 / 1.000 / 900 €, Berufseinstieg 10.000 / 2.500 / 1.800 € (= default),
    // Erfahren 50.000 / 4.500 / 3.000 €
    it('offers the presets of the product specification', () => {
      expect(PLAYER_PRESETS).toEqual([
        {
          id: 'student',
          start: { startCapital: 200_000, netIncome: 100_000, livingCosts: 90_000 },
        },
        {
          id: 'career-start',
          start: { startCapital: 1_000_000, netIncome: 250_000, livingCosts: 180_000 },
        },
        {
          id: 'experienced',
          start: { startCapital: 5_000_000, netIncome: 450_000, livingCosts: 300_000 },
        },
      ]);
      expect(DEFAULT_START_CONDITIONS).toEqual({
        startCapital: 1_000_000,
        netIncome: 250_000,
        livingCosts: 180_000,
      });
    });

    it.each([
      [{ startCapital: 200_000, netIncome: 100_000, livingCosts: 90_000 }, 'student'],
      [{ startCapital: 1_000_000, netIncome: 250_000, livingCosts: 180_000 }, 'career-start'],
      [{ startCapital: 5_000_000, netIncome: 450_000, livingCosts: 300_000 }, 'experienced'],
      [{ startCapital: 200_000, netIncome: 100_000, livingCosts: 90_001 }, null],
      [{ startCapital: 200_000, netIncome: 100_001, livingCosts: 90_000 }, null],
      [{ startCapital: 200_001, netIncome: 100_000, livingCosts: 90_000 }, null],
    ])('finds the preset of %j: %s', (start, expected) => {
      expect(matchingPreset(start)).toBe(expected);
    });
  });

  describe('livingCostsExceedIncome', () => {
    // PS US-SP-01, TS §7.4: a hint, not an error, when living costs exceed the income
    it.each([
      [250_000, 250_001, true],
      [250_000, 250_000, false],
      [250_000, 180_000, false],
      [0, 1, true],
      [null, 1, false],
      [1, null, false],
    ])('income %s, living costs %s: %s', (netIncome, livingCosts, expected) => {
      expect(livingCostsExceedIncome(netIncome, livingCosts)).toBe(expected);
    });
  });

  describe('isOutdated', () => {
    const current = { simVersion: 3, schemaVersion: 5 };

    // TS §15, E-25: another simVersion or schemaVersion marks the player outdated
    it.each([
      ['the same versions', 3, { simVersion: 3, schemaVersion: 5 }, false],
      ['no snapshot yet', 3, undefined, false],
      ['an older profile', 2, undefined, true],
      ['a newer profile', 4, { simVersion: 3, schemaVersion: 5 }, true],
      ['another snapshot simVersion', 3, { simVersion: 2, schemaVersion: 5 }, true],
      ['another snapshot schemaVersion', 3, { simVersion: 3, schemaVersion: 4 }, true],
    ])('%s: %s', (_label, simVersion, snapshot, expected) => {
      expect(isOutdated({ simVersion }, snapshot, current)).toBe(expected);
    });

    it('compares with the versions of this app by default', () => {
      expect(
        isOutdated(
          { simVersion: SIM_VERSION },
          { simVersion: SIM_VERSION, schemaVersion: SCHEMA_VERSION },
        ),
      ).toBe(false);
      expect(
        isOutdated(
          { simVersion: SIM_VERSION },
          { simVersion: SIM_VERSION, schemaVersion: SCHEMA_VERSION + 1 },
        ),
      ).toBe(true);
    });
  });

  describe('createPlayerProfile', () => {
    it('trims the name, normalises the seed and stores the version', () => {
      expect(createPlayerProfile(NEW_PLAYER, 'p1', 1_234)).toEqual({
        id: 'p1',
        name: 'Anna',
        seed: 'kupfer-falke-731',
        seedKey: expect.any(Array),
        start: { startCapital: 1_000_000, netIncome: 250_000, livingCosts: 180_000 },
        simVersion: SIM_VERSION,
        createdAt: 1_234,
      });
    });

    it('stores the key of the normalised seed as four 32-bit words', () => {
      const typed = createPlayerProfile(NEW_PLAYER, 'p1', 0).seedKey;
      const normalised = createPlayerProfile({ ...NEW_PLAYER, seed: 'kupfer-falke-731' }, 'p2', 0);
      const other = createPlayerProfile({ ...NEW_PLAYER, seed: 'kupfer-falke-732' }, 'p3', 0);
      expect(typed).toHaveLength(4);
      expect(
        typed.every((word) => Number.isInteger(word) && word >= 0 && word <= 0xffff_ffff),
      ).toBe(true);
      expect(normalised.seedKey).toEqual(typed);
      expect(other.seedKey).not.toEqual(typed);
    });

    it.each<[string, NewPlayer]>([
      ['an empty name', { ...NEW_PLAYER, name: ' ' }],
      ['an empty seed', { ...NEW_PLAYER, seed: ' ' }],
      [
        'too much capital',
        { ...NEW_PLAYER, start: { ...NEW_PLAYER.start, startCapital: 100_000_001 } },
      ],
      ['negative income', { ...NEW_PLAYER, start: { ...NEW_PLAYER.start, netIncome: -1 } }],
      [
        'fractional living costs',
        { ...NEW_PLAYER, start: { ...NEW_PLAYER.start, livingCosts: 1.5 } },
      ],
    ])('rejects %s', (_label, input) => {
      expect(() => createPlayerProfile(input, 'p1', 0)).toThrow(/invalid input \([a-z-]+\)$/);
    });

    it('names every broken rule', () => {
      const input = { ...NEW_PLAYER, name: '', seed: '' };
      expect(() => createPlayerProfile(input, 'p1', 0)).toThrow(
        'invalid input (required, required)',
      );
    });

    it('accepts living costs above the income', () => {
      const input = { ...NEW_PLAYER, start: { ...NEW_PLAYER.start, livingCosts: 300_000 } };
      expect(createPlayerProfile(input, 'p1', 0).start.livingCosts).toBe(300_000);
    });
  });

  describe('toPlayerListEntry', () => {
    it('takes the game time and the last use from the clock', () => {
      const entry = toPlayerListEntry(
        profile(),
        { tick: 5_400_000, lastSeenAt: 2_000 },
        { simVersion: SIM_VERSION, schemaVersion: SCHEMA_VERSION },
      );
      expect(entry).toEqual({
        id: 'p1',
        name: 'Anna',
        seed: 'kupfer-falke-731',
        tick: 5_400_000,
        lastSeenAt: 2_000,
        createdAt: 1_000,
        outdated: false,
      });
    });

    // TS §9.1: the worker stores the net worth with the clock from M3 on
    it('takes the net worth from the clock, also when it is negative', () => {
      const versions = { simVersion: SIM_VERSION, schemaVersion: SCHEMA_VERSION };
      expect(
        toPlayerListEntry(
          profile(),
          { tick: 5_400_000, lastSeenAt: 2_000, netWorth: 1_234_567 },
          versions,
        ).netWorth,
      ).toBe(1_234_567);
      expect(
        toPlayerListEntry(
          profile(),
          { tick: 5_400_000, lastSeenAt: 2_000, netWorth: -500 },
          versions,
        ).netWorth,
      ).toBe(-500);
      expect(
        toPlayerListEntry(profile(), { tick: 5_400_000, lastSeenAt: 2_000, netWorth: 0 }, versions)
          .netWorth,
      ).toBe(0);
    });

    it('has no net worth for a clock stored before M3', () => {
      const entry = toPlayerListEntry(profile(), { tick: 5_400_000, lastSeenAt: 2_000 }, undefined);
      expect('netWorth' in entry).toBe(false);
    });

    it('has no game time for a player the worker never loaded', () => {
      const entry = toPlayerListEntry(profile(), undefined, undefined);
      expect(entry).toMatchObject({ tick: null, lastSeenAt: null, outdated: false });
    });

    it('marks a player whose snapshot has another schema version', () => {
      const entry = toPlayerListEntry(profile(), undefined, {
        simVersion: SIM_VERSION,
        schemaVersion: SCHEMA_VERSION + 1,
      });
      expect(entry.outdated).toBe(true);
    });
  });

  describe('sortPlayerList', () => {
    const entry = (id: string, lastSeenAt: number | null, createdAt: number): PlayerListEntry => ({
      id,
      name: id,
      seed: id,
      tick: null,
      lastSeenAt,
      createdAt,
      outdated: false,
    });

    it('puts the most recently used player first', () => {
      const sorted = sortPlayerList([
        entry('a', 10, 1),
        entry('b', null, 30),
        entry('c', 20, 2),
        entry('e', 20, 3),
        entry('d', 20, 3),
      ]);
      expect(sorted.map(({ id }) => id)).toEqual(['b', 'c', 'd', 'e', 'a']);
    });

    it('keeps every entry exactly once', () => {
      fc.assert(
        fc.property(
          fc
            .uniqueArray(fc.nat(), { selector: (n) => n })
            .map((ids) => ids.map((id) => entry(String(id), id % 3 === 0 ? null : id * 7, id))),
          (entries) => {
            const sorted = sortPlayerList(entries);
            expect(sorted.map(({ id }) => id).sort()).toEqual(entries.map(({ id }) => id).sort());
          },
        ),
      );
    });
  });
});
