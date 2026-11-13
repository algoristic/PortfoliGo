import { createGameWorld } from '@app/engine/domain/game-world';
import { Instrument } from '@app/market/domain/models/instrument.model';
import { seriesCount, seriesIds } from '@app/market/domain/series';

import { EngineQuery, EngineQueryResult } from '../service/engine-service.model';
import { advance, FINE, HostHarness, MINI_PLAYER } from '../testing/host-harness';
import { generateMiniWorld } from '../testing/in-process-engine-worker';

// Market queries and the movers topic through the worker host (TS §8.2–§8.4, AP 4.1) on the mini
// world.

const { seedKey, world } = generateMiniWorld(MINI_PLAYER.seed);
const { context } = createGameWorld(seedKey, world);

function maxInAnySecond(times: readonly number[]): number {
  return Math.max(
    0,
    ...times.map((start) => times.filter((at) => at >= start && at < start + 1_000).length),
  );
}

async function query<K extends EngineQuery['kind']>(
  harness: HostHarness,
  request: Extract<EngineQuery, { kind: K }>,
): Promise<Extract<EngineQueryResult, { kind: K }>> {
  const reply = await harness.send('query', { query: request });
  if (!reply.ok) {
    throw new Error(`query failed: ${reply.error}`);
  }
  return reply.data as Extract<EngineQueryResult, { kind: K }>;
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

describe('EngineHost market queries', () => {
  it('needs a loaded player', async () => {
    const harness = new HostHarness();
    expect(await harness.send('query', { query: { kind: 'instruments' } })).toMatchObject({
      ok: false,
      error: 'player-not-loaded',
    });
  });

  it('lists the master data of every series', async () => {
    const harness = new HostHarness();
    await harness.send('loadPlayer', MINI_PLAYER);
    const { instruments } = await query(harness, { kind: 'instruments' });
    expect(instruments).toHaveLength(seriesCount(context));
    expect(instruments.map(({ id }) => id)).toEqual(seriesIds(context));
    const company = world.companies[0];
    expect(instruments.find(({ id }) => id === company.id)).toMatchObject({
      kind: 'stock',
      name: company.name,
      isin: company.isin,
      sectorId: company.sectorId,
    });
  });

  it('answers the details of a series or unknown-instrument', async () => {
    const harness = new HostHarness();
    await harness.send('loadPlayer', MINI_PLAYER);
    const company = world.companies[1];
    const { details } = await query(harness, { kind: 'instrumentDetails', id: company.id });
    expect(details).toMatchObject({
      kind: 'stock',
      id: company.id,
      foundedYear: company.foundedYear,
      employees: company.employees,
    });
    expect(
      await harness.send('query', { query: { kind: 'instrumentDetails', id: 'cmp-999' } }),
    ).toMatchObject({ ok: false, error: 'unknown-instrument' });
    expect(
      await harness.send('query', { query: { kind: 'instrumentDetails', id: '' } }),
    ).toMatchObject({ ok: false, error: 'invalid-command' });
  });

  it('screens up to the current tick with the prices of the quotes', async () => {
    const harness = await running();
    await harness.send('pause', {});
    const tick = harness.clock.tick;
    const european = world.companies.filter(({ regionId }) => regionId === 'europe');
    await harness.send('subscribe', { series: [0, 1, 2] });
    const result = await query(harness, {
      kind: 'screener',
      regions: ['europe'],
      assetClasses: ['stock'],
      sort: { key: 'changeRatio', direction: 'desc' },
    });
    expect(result.tick).toBe(tick);
    expect(result.total).toBe(european.length);
    expect(result.rows.map(({ id }) => id).sort()).toEqual(european.map(({ id }) => id).sort());
    const ratios = result.rows.map(({ changeRatio }) => changeRatio);
    expect(ratios).toEqual([...ratios].sort((a, b) => b - a));
    const quotes = harness.quotes;
    expect(quotes.tick).toBe(tick);
    for (const quote of quotes.quotes) {
      const row = result.rows.find(({ series }) => series === quote.series);
      if (row !== undefined) {
        expect(row.last).toBe(quote.last);
        expect(row.changeRatio).toBe(quote.changeRatio);
        expect(row.sparkline.at(-1)).toBe(quote.last);
        expect(row.sparkline.at(-2)).toBe(quote.previousClose);
      }
    }
  });

  it.each<[string, unknown]>([
    ['an unknown region', { kind: 'screener', regions: ['atlantis'] }],
    ['an unknown sort key', { kind: 'screener', sort: { key: 'volume', direction: 'asc' } }],
    ['a yield bound that is no number', { kind: 'screener', dividendYield: { min: '1' } }],
    ['a search text that is too long', { kind: 'screener', search: 'x'.repeat(101) }],
  ])('answers a screener query with %s with invalid-command', async (_label, request) => {
    const harness = new HostHarness();
    await harness.send('loadPlayer', MINI_PLAYER);
    expect(await harness.send('query', { query: request as EngineQuery })).toMatchObject({
      ok: false,
      error: 'invalid-command',
    });
  });

  describe('movers', () => {
    it('sends gainers, losers and sectors while subscribed, at most 4 per second', async () => {
      const harness = await running();
      expect(harness.events('movers')).toEqual([]);
      await harness.send('subscribe', { series: [], movers: true });
      const first = harness.events('movers').at(-1)?.payload;
      expect(first?.tick).toBe(harness.clock.tick);
      expect(first?.sectors.map(({ sectorId }) => sectorId)).toEqual(
        world.indices.filter(({ kind }) => kind === 'sector').map(({ sectorId }) => sectorId),
      );
      await advance(harness, 3_000);
      const events = harness.events('movers');
      expect(events.length).toBeGreaterThanOrEqual(10);
      expect(maxInAnySecond(events.map(({ atMs }) => atMs))).toBeLessThanOrEqual(4);
      const last = events.at(-1)?.payload;
      const gains = last?.gainers.map(({ changeRatio }) => changeRatio) ?? [];
      expect(gains.every((ratio) => ratio > 0)).toBe(true);
      expect(gains).toEqual([...gains].sort((a, b) => b - a));
      expect(last?.losers.every(({ changeRatio }) => changeRatio < 0)).toBe(true);

      await harness.send('unsubscribe', { series: [], movers: true });
      const count = harness.events('movers').length;
      await advance(harness, 2_000);
      expect(harness.events('movers')).toHaveLength(count);
    });

    it('sends nothing while the tick stands still', async () => {
      const harness = await running();
      await harness.send('pause', {});
      await harness.send('subscribe', { series: [], movers: true });
      const count = harness.events('movers').length;
      expect(count).toBe(1);
      await advance(harness, 2_000);
      expect(harness.events('movers')).toHaveLength(count);
    });
  });

  it('keeps the instruments of the movers among the shares', async () => {
    const harness = await running();
    const { instruments } = await query(harness, { kind: 'instruments' });
    await harness.send('subscribe', { series: [], movers: true });
    const movers = harness.events('movers').at(-1)?.payload;
    const stocks = new Set(
      instruments.filter((i: Instrument) => i.kind === 'stock').map(({ series }) => series),
    );
    for (const quote of [...(movers?.gainers ?? []), ...(movers?.losers ?? [])]) {
      expect(stocks.has(quote.series)).toBe(true);
    }
  });

  describe('instrument facts (AP 4.5)', () => {
    it('answers figures, dividends and composition up to the current tick', async () => {
      const harness = await running();
      await harness.send('pause', {});
      const tick = harness.clock.tick;
      const today = Math.floor(tick / 1_440);
      const company = world.companies[0];
      const { figures, tick: figuresTick } = await query(harness, {
        kind: 'instrumentFigures',
        id: company.id,
      });
      expect(figuresTick).toBe(tick);
      expect(figures.id).toBe(company.id);
      expect(figures.marketCap).toBe(company.sharesOutstanding * figures.last);
      expect(figures.volatility).toBeGreaterThan(0);
      expect(typeof figures.indicativeValue).toBe('number');
      for (const instrument of [
        ...world.companies.map(({ id }) => id),
        ...world.etfs.map(({ id }) => id),
      ]) {
        const dividends = await query(harness, { kind: 'instrumentDividends', id: instrument });
        expect(dividends.tick).toBe(tick);
        expect(dividends.history.every(({ exDay }) => exDay <= today)).toBe(true);
        if (dividends.next !== null) {
          expect(dividends.next.exDay).toBeGreaterThanOrEqual(today);
        }
      }
      const index = world.indices[0];
      const { composition } = await query(harness, { kind: 'instrumentComposition', id: index.id });
      expect(composition?.constituentCount).toBe(index.constituents.length);
      const stock = await query(harness, { kind: 'instrumentComposition', id: company.id });
      expect(stock.composition).toBeNull();
    });

    it.each(['instrumentFigures', 'instrumentDividends', 'instrumentComposition'] as const)(
      'answers %s with unknown-instrument or invalid-command',
      async (kind) => {
        const harness = new HostHarness();
        await harness.send('loadPlayer', MINI_PLAYER);
        expect(await harness.send('query', { query: { kind, id: 'cmp-999' } })).toMatchObject({
          ok: false,
          error: 'unknown-instrument',
        });
        expect(
          await harness.send('query', { query: { kind, id: 7 } as unknown as EngineQuery }),
        ).toMatchObject({ ok: false, error: 'invalid-command' });
      },
    );
  });
});
