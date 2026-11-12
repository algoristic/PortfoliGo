import { BankType, TradingVenue } from '@app/banking/domain/models/bank-conditions.model';
import { SeriesKind } from '@app/market/domain/series';
import { Cents } from '@app/shared/domain/models/money.model';
import { Company } from '@app/world/domain/models/company.model';
import { EtfReplication } from '@app/world/domain/models/etf.model';
import { IndexKind } from '@app/world/domain/models/market-index.model';

/** Flat table rows of a generated world for the simulation lab (TS §14.2). */
export interface CompanyRow {
  id: string;
  name: string;
  ticker: string;
  isin: string;
  countryId: string;
  exchangeId: string;
  sectorId: string;
  size: Company['size'];
  riskClass: Company['riskClass'];
  startPrice: number;
  marketCap: Cents;
  dividendYield: number;
}

export interface IndexRow {
  id: string;
  name: string;
  ticker: string;
  kind: IndexKind;
  constituentCount: number;
  capWeight: number | null;
  baseValue: number;
}

export interface EtfRow {
  id: string;
  name: string;
  ticker: string;
  issuerName: string;
  indexName: string;
  distributing: boolean;
  ter: number;
  replication: EtfReplication;
  startPrice: number;
}

export interface BankRow {
  id: string;
  name: string;
  type: BankType;
  venue: TradingVenue;
  spreadMarkup: number;
  fractionalShares: boolean;
  hasSavingsAccount: boolean;
}

/** A price series of the market (`series.ts`); the UI builds the label from name and kind. */
export interface SeriesOption {
  series: number;
  id: string;
  kind: SeriesKind;
  name: string;
  ticker: string;
}

export interface WorldOverview {
  companies: CompanyRow[];
  indices: IndexRow[];
  etfs: EtfRow[];
  banks: BankRow[];
  series: SeriesOption[];
}
