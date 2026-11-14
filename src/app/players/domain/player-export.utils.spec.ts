import { PlayerExport } from './models/player-export.model';
import { isPlayerExport } from './player-export.utils';
import { exportFixtureContent } from './testing/export-fixture';

// Type guards of the import (TS §10.3) on the export fixture after `fromTaggedJson`.

const CHECKSUM = `sha256:${'0'.repeat(64)}`;

let valid: PlayerExport;

beforeAll(() => {
  valid = { ...exportFixtureContent(), checksum: CHECKSUM };
});

type Change = (exported: PlayerExport) => unknown;

function without(key: keyof PlayerExport): Change {
  return (exported) => {
    const copy: Partial<PlayerExport> = { ...exported };
    delete copy[key];
    return copy;
  };
}

describe('isPlayerExport', () => {
  it('accepts the export', () => {
    expect(isPlayerExport(valid)).toBe(true);
  });

  it.each<[string, Change]>([
    ['no object', () => [valid]],
    ['null', () => null],
    ...(
      [
        'format',
        'formatVersion',
        'appVersion',
        'simVersion',
        'schemaVersion',
        'exportedAt',
        'player',
        'clock',
        'state',
        'market',
        'marketChecksum',
        'transactions',
        'notifications',
        'series',
        'checksum',
      ] as const
    ).map((key): [string, Change] => [`without ${key}`, without(key)]),
    ['another format', (e) => ({ ...e, format: 'portfoligo/other' })],
    ['format version 2', (e) => ({ ...e, formatVersion: 2 })],
    ['a local time', (e) => ({ ...e, exportedAt: '2026-11-14T10:41:00.000+01:00' })],
    ['a name that is no text', (e) => ({ ...e, player: { ...e.player, name: 1 } })],
    [
      'start conditions in euros',
      (e) => ({
        ...e,
        player: {
          ...e.player,
          startConditions: { ...e.player.startConditions, startCapital: 0.5 },
        },
      }),
    ],
    ['an unknown speed', (e) => ({ ...e, clock: { ...e.clock, speed: '3h' } })],
    ['a clock of another tick', (e) => ({ ...e, clock: { ...e.clock, tick: e.clock.tick - 1 } })],
    [
      'balances as an object',
      (e) => ({
        ...e,
        state: { ...e.state, player: { ...e.state.player, balances: { 'acc-1': 1 } } },
      }),
    ],
    [
      'an unknown background mode',
      (e) => ({
        ...e,
        state: { ...e.state, player: { ...e.state.player, backgroundMode: 'never' } },
      }),
    ],
    [
      'positions that are no list',
      (e) => ({ ...e, state: { ...e.state, player: { ...e.state.player, positions: {} } } }),
    ],
    [
      'a negative order counter',
      (e) => ({ ...e, state: { ...e.state, player: { ...e.state.player, orderSequence: -1 } } }),
    ],
    [
      'a task without a kind',
      (e) => ({
        ...e,
        state: {
          ...e.state,
          scheduler: { ...e.state.scheduler, heap: [{ tick: 1, seq: 1 }] },
        },
      }),
    ],
    ['command IDs that are no texts', (e) => ({ ...e, state: { ...e.state, commandIds: [1] } })],
    ['a market of the next day', (e) => ({ ...e, market: { ...e.market, day: e.market.day + 1 } })],
    ['an unknown phase', (e) => ({ ...e, market: { ...e.market, phase: 'mania' } })],
    [
      'closes as a plain list',
      (e) => ({ ...e, market: { ...e.market, logClose: Array.from(e.market.logClose) } }),
    ],
    [
      'one close too few',
      (e) => ({ ...e, market: { ...e.market, logClose: e.market.logClose.slice(1) } }),
    ],
    ['a short market checksum', (e) => ({ ...e, marketChecksum: e.marketChecksum.slice(1) })],
    [
      'a transaction after the export tick',
      (e) => ({
        ...e,
        transactions: [
          ...e.transactions,
          { ...e.transactions[0], seq: 99, tick: e.state.tick + 1 },
        ],
      }),
    ],
    [
      'a transaction without postings',
      (e) => ({ ...e, transactions: [{ ...e.transactions[0], postings: undefined }] }),
    ],
    [
      'a notification without a code',
      (e) => ({ ...e, notifications: [{ ...e.notifications[0], code: undefined }] }),
    ],
    [
      'a daily point after the export tick',
      (e) => ({
        ...e,
        series: { performance: [{ ...e.series.performance[0], tick: e.state.tick + 1 }] },
      }),
    ],
    ['another checksum algorithm', (e) => ({ ...e, checksum: `md5:${'0'.repeat(64)}` })],
    ['an upper-case checksum', (e) => ({ ...e, checksum: `sha256:${'A'.repeat(64)}` })],
  ])('rejects %s', (_label, change) => {
    expect(isPlayerExport(change(valid))).toBe(false);
  });
});
