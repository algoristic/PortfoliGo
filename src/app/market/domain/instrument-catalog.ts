import { World } from '@app/world/domain/models/world.model';

import { MarketContext } from './market-context';
import { Instrument, InstrumentDetails } from './models/instrument.model';
import { etfSeries, indexSeries, totalReturnSeries } from './series';

/**
 * Master data of all series in series order (TS §8.2, AP 4.1): shares, price indices, total return
 * indices, ETFs. Indices and ETFs take region and sector from their index.
 */
export function instrumentCatalog(world: World, context: MarketContext): Instrument[] {
  const companyIndex = new Map(context.layout.instrumentIds.map((id, i) => [id, i]));
  const indexPosition = new Map(context.indices.ids.map((id, x) => [id, x]));
  const etfPosition = new Map(context.etfs.ids.map((id, e) => [id, e]));
  const stocks: Instrument[] = world.companies.map((company) => ({
    kind: 'stock',
    id: company.id,
    series: required(companyIndex, company.id),
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
  }));
  const indices: Instrument[] = (['price', 'total-return'] as const).flatMap((variant) =>
    world.indices.map((index) => {
      const x = required(indexPosition, index.id);
      return {
        kind: 'index',
        id: variant === 'price' ? index.id : `${index.id}-tr`,
        series: variant === 'price' ? indexSeries(context, x) : totalReturnSeries(context, x),
        name: index.name,
        ticker: index.ticker,
        isin: null,
        exchangeId: null,
        regionId: index.regionId,
        countryId: null,
        sectorId: index.sectorId,
        industryId: null,
        size: null,
        style: null,
        riskClass: null,
        savingsPlanEligible: false,
        variant,
        indexKind: index.kind,
        indexId: index.id,
        constituentCount: index.constituents.length,
      } satisfies Instrument;
    }),
  );
  const issuers = new Map(world.etfIssuers.map((issuer) => [issuer.id, issuer.name]));
  const indexById = new Map(world.indices.map((index) => [index.id, index]));
  const etfs: Instrument[] = world.etfs.map((etf) => {
    const index = indexById.get(etf.indexId);
    const issuerName = issuers.get(etf.issuerId);
    if (index === undefined || issuerName === undefined) {
      throw new Error(`instrumentCatalog: ETF ${etf.id} without index or issuer`);
    }
    return {
      kind: 'etf',
      id: etf.id,
      series: etfSeries(context, required(etfPosition, etf.id)),
      name: etf.name,
      ticker: etf.ticker,
      isin: etf.isin,
      exchangeId: etf.exchangeId,
      regionId: index.regionId,
      countryId: null,
      sectorId: index.sectorId,
      industryId: null,
      size: null,
      style: null,
      riskClass: null,
      savingsPlanEligible: etf.savingsPlanEligible,
      issuerId: etf.issuerId,
      issuerName,
      indexId: etf.indexId,
      ter: etf.ter,
      distribution: etf.distribution.kind,
      distributionFrequency:
        etf.distribution.kind === 'distributing' ? etf.distribution.frequency : null,
      replication: etf.replication,
      fundVolume: etf.fundVolume,
    };
  });
  return [...stocks, ...indices, ...etfs].sort((a, b) => a.series - b.series);
}

/** Static details of one series (TS §8.2), `null` for an unknown ID. */
export function instrumentDetails(world: World, id: string): InstrumentDetails | null {
  const company = world.companies.find((candidate) => candidate.id === id);
  if (company !== undefined) {
    return {
      kind: 'stock',
      id,
      profile: { ...company.profile },
      foundedYear: company.foundedYear,
      employees: company.employees,
      sharesOutstanding: company.sharesOutstanding,
      freeFloatShares: company.freeFloatShares,
      dividendFrequency: company.dividend.frequency,
      indexIds: world.indices
        .filter((index) => index.constituents.includes(id))
        .map((index) => index.id),
    };
  }
  const index = world.indices.find(
    (candidate) => candidate.id === id || `${candidate.id}-tr` === id,
  );
  if (index !== undefined) {
    return { kind: 'index', id, capWeight: index.capWeight, baseValue: index.baseValue };
  }
  const etf = world.etfs.find((candidate) => candidate.id === id);
  if (etf !== undefined) {
    return {
      kind: 'etf',
      id,
      distributionSchedule:
        etf.distribution.kind === 'distributing' ? { ...etf.distribution.schedule } : null,
    };
  }
  return null;
}

function required(positions: ReadonlyMap<string, number>, id: string): number {
  const position = positions.get(id);
  if (position === undefined) {
    throw new Error(`instrumentCatalog: ${id} is not in the market layout`);
  }
  return position;
}
