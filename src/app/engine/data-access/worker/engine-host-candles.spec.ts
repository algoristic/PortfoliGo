import { GameEngine } from '@app/engine/domain/game-engine';
import { createGameWorld } from '@app/engine/domain/game-world';
import { Candle } from '@app/market/domain/models/candle.model';
import { PriceSource } from '@app/market/domain/price-source';
import { seriesIds } from '@app/market/domain/series';

import { CandlesQuery, EngineQueryResult } from '../service/engine-service.model';
import { advance, FINE, gameTick, HostHarness, MINI_PLAYER } from '../testing/host-harness';
import { generateMiniWorld } from '../testing/in-process-engine-worker';

// The candle query and the chart subscription through the worker host (TS §8.2–§8.4, AP 4.1) on
// the mini world. Oracle: the minute curves of an engine of its own on the same seed.

const { seedKey, world } = generateMiniWorld(MINI_PLAYER.seed);
const DAY = 24 * 60;

/** A share of a European exchange: it trades on Monday 01.04.2030 at 10:00. */
const company = world.companies.findIndex(({ regionId }) => regionId === 'europe');
const exchange = world.exchanges.find(({ id }) => id === world.companies[company].exchangeId);

let reference: PriceSource;

/** Minute curve of the share on a day from the reference engine. */
function curve(series: number, day: number): Float64Array {
  return reference.minuteCurve(series, day, gameTick(2030, 4, 3));
}

function dayOf(tick: number): number {
  return Math.floor(tick / DAY);
}

/** Weekdays with a start in `[from, to)`, counted with `Date`. */
function weekdays(from: number, to: number): number {
  let count = 0;
  for (let tick = from; tick < to; tick += DAY) {
    const weekday = new Date(Date.UTC(2020, 0, 1) + tick * 60_000).getUTCDay();
    if (weekday !== 0 && weekday !== 6) {
      count++;
    }
  }
  return count;
}

function maxInAnySecond(times: readonly number[]): number {
  return Math.max(
    0,
    ...times.map((start) => times.filter((at) => at >= start && at < start + 1_000).length),
  );
}

type CandlesResult = Extract<EngineQueryResult, { kind: 'candles' }>;

async function candles(
  harness: HostHarness,
  request: Omit<CandlesQuery, 'kind'>,
): Promise<CandlesResult> {
  const reply = await harness.send('query', { query: { kind: 'candles', ...request } });
  if (!reply.ok) {
    throw new Error(`query failed: ${reply.error}`);
  }
  return reply.data as CandlesResult;
}

async function running(): Promise<HostHarness> {
  const harness = new HostHarness({ config: FINE });
  await harness.send('loadPlayer', MINI_PLAYER);
  await harness.send('setSpeed', { speed: '1h' });
  await harness.send('resume', {});
  // Monday 01.04.2030, 10:00: Europe trades.
  await advance(harness, 10_000);
  return harness;
}

describe('EngineHost candles', () => {
  beforeAll(() => {
    const engine = GameEngine.start(createGameWorld(seedKey, world), MINI_PLAYER.start);
    engine.runUntil(gameTick(2030, 4, 3));
    reference = engine.prices as PriceSource;
  });

  it('finds a European share for the tests', () => {
    expect(company).toBeGreaterThanOrEqual(0);
    expect(exchange).toBeDefined();
  });

  it('answers every minute of a day before the game start', async () => {
    const harness = new HostHarness();
    await harness.send('loadPlayer', MINI_PLAYER);
    const from = gameTick(2029, 11, 14);
    const result = await candles(harness, {
      series: company,
      interval: '1m',
      from,
      to: from + DAY - 1,
    });
    const minutes = curve(company, dayOf(from));
    const open = exchange?.open ?? 0;
    expect(result.candles).toHaveLength((exchange?.close ?? 0) - open);
    expect(result.hasOlder).toBe(true);
    result.candles.forEach((candle, j) => {
      expect(candle).toEqual({
        tick: from + open + j,
        open: minutes[j],
        high: Math.max(minutes[j], minutes[j + 1]),
        low: Math.min(minutes[j], minutes[j + 1]),
        close: minutes[j + 1],
      });
    });
  });

  it('answers daily candles over years from the support points, never from minute curves', async () => {
    const harness = new HostHarness();
    await harness.send('loadPlayer', MINI_PLAYER);
    const result = await candles(harness, {
      series: company,
      interval: '1d',
      from: gameTick(2025, 4, 1),
    });
    // Weekdays from 01.04.2025 to 29.03.2030; the game start (Monday 00:00) has none yet.
    expect(result.candles).toHaveLength(weekdays(gameTick(2025, 4, 1), gameTick(2030, 3, 30)));
    expect(result.candles[0].tick).toBe(gameTick(2025, 4, 1));
    expect(result.candles.at(-1)?.tick).toBe(gameTick(2030, 3, 29));
    expect(result.hasOlder).toBe(true);
    for (const candle of result.candles) {
      // Nothing is stored before the background job: open and close only.
      expect(candle.high).toBe(Math.max(candle.open, candle.close));
      expect(candle.low).toBe(Math.min(candle.open, candle.close));
    }
    for (const date of [gameTick(2025, 4, 1), gameTick(2027, 8, 16), gameTick(2030, 3, 29)]) {
      const candle = result.candles.find(({ tick }) => tick === date);
      const minutes = curve(company, dayOf(date));
      expect(candle?.open).toBe(minutes[0]);
      expect(candle?.close).toBe(minutes[minutes.length - 1]);
    }
  });

  it('answers weekly candles back to the epoch', async () => {
    const harness = new HostHarness();
    await harness.send('loadPlayer', MINI_PLAYER);
    const result = await candles(harness, { series: company, interval: '1w' });
    // Weeks from Monday 30.12.2019 to the week of Friday 29.03.2030.
    expect(result.candles).toHaveLength(
      (gameTick(2030, 3, 25) - gameTick(2019, 12, 30)) / DAY / 7 + 1,
    );
    expect(result.candles[0].tick).toBe(gameTick(2019, 12, 30));
    expect(result.hasOlder).toBe(false);
    const first = curve(company, 0);
    expect(result.candles[0].open).toBe(first[0]);
  });

  it('loads older blocks before `to` until the epoch', async () => {
    const harness = new HostHarness();
    await harness.send('loadPlayer', MINI_PLAYER);
    const newest = await candles(harness, { series: company, interval: '1d', limit: 2_000 });
    expect(newest.candles).toHaveLength(2_000);
    expect(newest.hasOlder).toBe(true);
    const older = await candles(harness, {
      series: company,
      interval: '1d',
      to: newest.candles[0].tick - 1,
      limit: 2_000,
    });
    expect(older.hasOlder).toBe(false);
    expect(older.candles[0].tick).toBe(0);
    expect(older.candles.at(-1)?.tick).toBe(newest.candles[0].tick - DAY * 3);
  });

  it('uses the stored and buffered candles with their high and low', async () => {
    const harness = await running();
    // Tuesday 02.04.2030, 02:00: every session of Monday closed.
    await advance(harness, 16_000);
    await harness.send('pause', {});
    const monday = gameTick(2030, 4, 1);
    const result = await candles(harness, {
      series: company,
      interval: '1d',
      from: monday,
    });
    expect(result.candles.map(({ tick }) => tick)).toEqual([monday]);
    const minutes = curve(company, dayOf(monday));
    const [candle] = result.candles;
    expect(Math.fround(candle.high)).toBe(Math.fround(Math.max(...minutes)));
    expect(Math.fround(candle.low)).toBe(Math.fround(Math.min(...minutes)));
    expect(Math.fround(candle.close)).toBe(Math.fround(minutes[minutes.length - 1]));
  });

  it('never answers candles after the current tick', async () => {
    const harness = await running();
    await harness.send('pause', {});
    const tick = harness.clock.tick;
    // Stored candles may reach beyond the tick after a restore (TS §9.2).
    const id = seriesIds(createGameWorld(seedKey, world).context)[company];
    for (const day of [dayOf(tick), dayOf(tick) + 1]) {
      await harness.storage.saveDailyCandles(MINI_PLAYER.playerId, [
        { seriesId: id, day, open: 1, high: 2, low: 0.5, close: 1.5 },
      ]);
    }
    for (const interval of ['1m', '1h', '1d', '1w'] as const) {
      const result = await candles(harness, { series: company, interval, limit: 50 });
      expect(result.tick).toBe(tick);
      expect(result.candles.every((candle: Candle) => candle.tick <= tick)).toBe(true);
    }
    const daily = await candles(harness, { series: company, interval: '1d', limit: 1 });
    const minutes = curve(company, dayOf(tick)).slice(
      0,
      tick - gameTick(2030, 4, 1) - (exchange?.open ?? 0) + 1,
    );
    expect(daily.candles).toEqual([
      {
        tick: gameTick(2030, 4, 1),
        open: minutes[0],
        high: Math.max(...minutes),
        low: Math.min(...minutes),
        close: minutes[minutes.length - 1],
      },
    ]);
  });

  it('answers an unknown series with unknown-instrument and senseless limits with invalid-command', async () => {
    const harness = new HostHarness();
    await harness.send('loadPlayer', MINI_PLAYER);
    expect(
      await harness.send('query', { query: { kind: 'candles', series: 9_999, interval: '1d' } }),
    ).toMatchObject({ ok: false, error: 'unknown-instrument' });
    expect(
      await harness.send('query', {
        query: { kind: 'candles', series: 0, interval: '1d', limit: 0 },
      }),
    ).toMatchObject({ ok: false, error: 'invalid-command' });
  });

  describe('chart subscription', () => {
    it('sends the newest candle of subscribed charts, at most 4 per second', async () => {
      const harness = await running();
      await harness.send('subscribe', {
        series: [],
        charts: [{ series: company, interval: '1m' }],
      });
      await advance(harness, 3_000);
      const events = harness.events('candle');
      expect(events.length).toBeGreaterThanOrEqual(10);
      expect(maxInAnySecond(events.map(({ atMs }) => atMs))).toBeLessThanOrEqual(4);
      for (const { payload } of events) {
        expect(payload).toMatchObject({ series: company, interval: '1m' });
        expect(payload.candle.tick).toBeLessThanOrEqual(payload.tick);
      }
      // At 1 h/s a new minute candle begins with every event: it carries the finished one before it.
      const [, second] = events;
      const minutes = curve(company, dayOf(second.payload.tick));
      const start = gameTick(2030, 4, 1) + (exchange?.open ?? 0);
      const j = (second.payload.previous?.tick ?? 0) - start;
      expect(second.payload.previous).toEqual({
        tick: second.payload.candle.tick - 1,
        open: minutes[j],
        high: Math.max(minutes[j], minutes[j + 1]),
        low: Math.min(minutes[j], minutes[j + 1]),
        close: minutes[j + 1],
      });
      // The running candle is partial: its close is the price at the event's tick.
      expect(second.payload.candle.close).toBe(minutes[second.payload.tick - start]);
    });

    it('sends only the subscribed charts and nothing after unsubscribe', async () => {
      const harness = await running();
      await harness.send('subscribe', {
        series: [],
        charts: [
          { series: company, interval: '1h' },
          { series: company, interval: '1d' },
        ],
      });
      await advance(harness, 1_000);
      const intervals = new Set(harness.events('candle').map(({ payload }) => payload.interval));
      expect([...intervals].sort()).toEqual(['1d', '1h']);

      await harness.send('unsubscribe', {
        series: [],
        charts: [{ series: company, interval: '1h' }],
      });
      const count = harness.events('candle').length;
      await advance(harness, 1_000);
      const later = harness.events('candle').slice(count);
      expect(later.length).toBeGreaterThan(0);
      expect(later.every(({ payload }) => payload.interval === '1d')).toBe(true);

      await harness.send('unsubscribe', {
        series: [],
        charts: [{ series: company, interval: '1d' }],
      });
      const total = harness.events('candle').length;
      await advance(harness, 1_000);
      expect(harness.events('candle')).toHaveLength(total);
    });

    it('stands still while paused and outside the session', async () => {
      const harness = await running();
      await harness.send('pause', {});
      await harness.send('subscribe', {
        series: [],
        charts: [{ series: company, interval: '5m' }],
      });
      expect(harness.events('candle')).toHaveLength(1);
      await advance(harness, 1_000);
      expect(harness.events('candle')).toHaveLength(1);

      // Monday evening, after the European close: the candle no longer changes.
      await harness.send('resume', {});
      await advance(harness, 9_000);
      const count = harness.events('candle').length;
      await advance(harness, 2_000);
      expect(harness.clock.tick).toBeGreaterThan(gameTick(2030, 4, 1, 20));
      expect(harness.events('candle')).toHaveLength(count);
    });
  });
});
