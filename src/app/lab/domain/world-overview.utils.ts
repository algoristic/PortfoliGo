import {
  BankRow,
  CompanyRow,
  EtfRow,
  IndexRow,
  SeriesOption,
  WorldOverview,
} from './models/world-overview.model';

import { World } from '../../world/domain/models/world.model';

/**
 * Table rows and the series list of a world. The series follow the numbering of `series.ts`:
 * shares, price indices, total return indices, ETFs.
 */
export function worldOverview(world: World): WorldOverview {
  const indexNames = new Map(world.indices.map((index) => [index.id, index.name]));
  const issuerNames = new Map(world.etfIssuers.map((issuer) => [issuer.id, issuer.name]));

  const companies: CompanyRow[] = world.companies.map((company) => ({
    id: company.id,
    name: company.name,
    ticker: company.ticker,
    isin: company.isin,
    countryId: company.countryId,
    exchangeId: company.exchangeId,
    sectorId: company.sectorId,
    size: company.size,
    riskClass: company.riskClass,
    startPrice: company.startPrice,
    marketCap: company.marketCap,
    dividendYield: company.dividend.yield,
  }));
  const indices: IndexRow[] = world.indices.map((index) => ({
    id: index.id,
    name: index.name,
    ticker: index.ticker,
    kind: index.kind,
    constituentCount: index.constituents.length,
    capWeight: index.capWeight,
    baseValue: index.baseValue,
  }));
  const etfs: EtfRow[] = world.etfs.map((etf) => ({
    id: etf.id,
    name: etf.name,
    ticker: etf.ticker,
    issuerName: issuerNames.get(etf.issuerId) ?? etf.issuerId,
    indexName: indexNames.get(etf.indexId) ?? etf.indexId,
    distributing: etf.distribution.kind === 'distributing',
    ter: etf.ter,
    replication: etf.replication,
    startPrice: etf.startPrice,
  }));
  const banks: BankRow[] = world.banks.map((bank) => ({
    id: bank.id,
    name: bank.name,
    type: bank.type,
    venue: bank.conditions.depot.venue,
    spreadMarkup: bank.conditions.depot.spreadMarkup,
    fractionalShares: bank.conditions.depot.fractionalShares,
    hasSavingsAccount: bank.conditions.savingsAccount !== null,
  }));

  const series: SeriesOption[] = [
    ...world.companies.map((company) => ({
      id: company.id,
      kind: 'stock' as const,
      name: company.name,
      ticker: company.ticker,
    })),
    ...world.indices.map((index) => ({
      id: index.id,
      kind: 'index' as const,
      name: index.name,
      ticker: index.ticker,
    })),
    ...world.indices.map((index) => ({
      id: `${index.id}-tr`,
      kind: 'total-return' as const,
      name: index.name,
      ticker: index.ticker,
    })),
    ...world.etfs.map((etf) => ({
      id: etf.id,
      kind: 'etf' as const,
      name: etf.name,
      ticker: etf.ticker,
    })),
  ].map((option, series) => ({ series, ...option }));

  return { companies, indices, etfs, banks, series };
}
