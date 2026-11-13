import { World } from '@app/world/domain/models/world.model';

import { instrumentCatalog, instrumentDetails } from './instrument-catalog';
import { MarketContext } from './market-context';
import { Instrument } from './models/instrument.model';
import { seriesCount, seriesIds, seriesRef } from './series';
import { miniMarket } from './testing/mini-market';

describe('instrumentCatalog', () => {
  let world: World;
  let context: MarketContext;
  let catalog: Instrument[];

  beforeAll(() => {
    ({ world, context } = miniMarket());
    catalog = instrumentCatalog(world, context);
  });

  it('lists every series once, in series order, with its stable ID', () => {
    expect(catalog.map(({ series }) => series)).toEqual(
      Array.from({ length: seriesCount(context) }, (_v, i) => i),
    );
    expect(catalog.map(({ id }) => id)).toEqual(seriesIds(context));
    catalog.forEach(({ kind, series }) => {
      const ref = seriesRef(context, series).kind;
      expect(kind).toBe(ref === 'total-return' ? 'index' : ref);
    });
  });

  it('takes the master data of a share from its company', () => {
    world.companies.forEach((company) => {
      const instrument = catalog.find(({ id }) => id === company.id);
      expect(instrument).toEqual({
        kind: 'stock',
        id: company.id,
        series: expect.any(Number),
        name: company.name,
        ticker: company.ticker,
        isin: company.isin,
        exchangeId: company.exchangeId,
        regionId: company.regionId,
        countryId: company.countryId,
        sectorId: company.sectorId,
        industryId: company.industryId,
        size: company.size,
        style: company.style,
        riskClass: company.riskClass,
        savingsPlanEligible: company.savingsPlanEligible,
      });
    });
  });

  it('gives price and total return index the definition of their index', () => {
    world.indices.forEach((index) => {
      const price = catalog.find(({ id }) => id === index.id);
      const total = catalog.find(({ id }) => id === `${index.id}-tr`);
      for (const [instrument, variant] of [
        [price, 'price'],
        [total, 'total-return'],
      ] as const) {
        expect(instrument).toMatchObject({
          kind: 'index',
          variant,
          indexId: index.id,
          indexKind: index.kind,
          name: index.name,
          isin: null,
          exchangeId: null,
          regionId: index.regionId,
          sectorId: index.sectorId,
          constituentCount: index.constituents.length,
          savingsPlanEligible: false,
        });
      }
    });
  });

  it('gives an ETF its terms and the region and sector of its index', () => {
    world.etfs.forEach((etf) => {
      const index = world.indices.find(({ id }) => id === etf.indexId);
      const issuer = world.etfIssuers.find(({ id }) => id === etf.issuerId);
      expect(catalog.find(({ id }) => id === etf.id)).toMatchObject({
        kind: 'etf',
        isin: etf.isin,
        exchangeId: etf.exchangeId,
        regionId: index?.regionId,
        sectorId: index?.sectorId,
        issuerId: etf.issuerId,
        issuerName: issuer?.name,
        indexId: etf.indexId,
        ter: etf.ter,
        distribution: etf.distribution.kind,
        distributionFrequency:
          etf.distribution.kind === 'distributing' ? etf.distribution.frequency : null,
        replication: etf.replication,
        fundVolume: etf.fundVolume,
        savingsPlanEligible: true,
      });
    });
    expect(
      new Set(
        catalog.filter(({ kind }) => kind === 'etf').map((e) => e.kind === 'etf' && e.distribution),
      ),
    ).toEqual(new Set(['accumulating', 'distributing']));
  });
});

describe('instrumentDetails', () => {
  let world: World;

  beforeAll(() => {
    ({ world } = miniMarket());
  });

  it('gives a share its profile, figures and index memberships', () => {
    const company = world.companies[0];
    const details = instrumentDetails(world, company.id);
    expect(details).toEqual({
      kind: 'stock',
      id: company.id,
      profile: company.profile,
      foundedYear: company.foundedYear,
      employees: company.employees,
      sharesOutstanding: company.sharesOutstanding,
      freeFloatShares: company.freeFloatShares,
      dividendFrequency: company.dividend.frequency,
      indexIds: world.indices
        .filter(({ constituents }) => constituents.some((id) => id === company.id))
        .map(({ id }) => id),
    });
    // Every company is in the world index at least.
    expect(details?.kind === 'stock' && details.indexIds.length).toBeGreaterThan(0);
  });

  it('gives both series of an index the same definition', () => {
    const index = world.indices[0];
    const expected = { capWeight: index.capWeight, baseValue: index.baseValue, kind: 'index' };
    expect(instrumentDetails(world, index.id)).toEqual({ ...expected, id: index.id });
    expect(instrumentDetails(world, `${index.id}-tr`)).toEqual({
      ...expected,
      id: `${index.id}-tr`,
    });
  });

  it('gives an ETF its distribution rhythm', () => {
    world.etfs.forEach((etf) => {
      expect(instrumentDetails(world, etf.id)).toEqual({
        kind: 'etf',
        id: etf.id,
        distributionSchedule:
          etf.distribution.kind === 'distributing' ? etf.distribution.schedule : null,
      });
    });
  });

  it('knows no other ID', () => {
    expect(instrumentDetails(world, 'cmp-999')).toBeNull();
    expect(instrumentDetails(world, '')).toBeNull();
  });
});
