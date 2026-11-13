import { Cents } from '@app/shared/domain/models/money.model';
import { CompanyProfile, DividendSchedule } from '@app/world/domain/models/company.model';
import { EtfDistributionFrequency, EtfReplication } from '@app/world/domain/models/etf.model';
import { IndexKind } from '@app/world/domain/models/market-index.model';
import {
  DividendFrequency,
  RegionId,
  RiskClass,
  SectorId,
  SizeClass,
  Style,
} from '@app/world/domain/models/taxonomy.model';

/** Asset classes of the screener (TS §5.3): shares, indices (price and total return), ETFs. */
export const INSTRUMENT_KINDS = ['stock', 'index', 'etf'] as const;
export type InstrumentKind = (typeof INSTRUMENT_KINDS)[number];

export const INDEX_VARIANTS = ['price', 'total-return'] as const;
export type IndexVariant = (typeof INDEX_VARIANTS)[number];

/**
 * Master data of a series as the UI sees it (TS §8.2, AP 4.1): codes instead of texts (TS §8.6),
 * proper names of the world as data. Fields that don't apply to a kind are `null`.
 */
interface InstrumentBase {
  /** Stable series ID (`seriesIds`): company, index (`<id>-tr` for total return) or ETF ID. */
  id: string;
  /** Series index for `subscribe` and `quotes`. */
  series: number;
  name: string;
  ticker: string;
  /** ISIN; `null` for indices. */
  isin: string | null;
  /** Exchange of shares and ETFs; `null` for indices. */
  exchangeId: string | null;
  /** Shares: their region; indices and ETFs: the region of the index, `null` if global. */
  regionId: RegionId | null;
  /** ISO code of a share's country. */
  countryId: string | null;
  /** Shares: their sector; indices and ETFs: the sector of a sector index. */
  sectorId: SectorId | null;
  industryId: string | null;
  size: SizeClass | null;
  style: Style | null;
  riskClass: RiskClass | null;
  savingsPlanEligible: boolean;
}

export interface StockInstrument extends InstrumentBase {
  kind: 'stock';
}

export interface IndexInstrument extends InstrumentBase {
  kind: 'index';
  variant: IndexVariant;
  indexKind: IndexKind;
  /** ID of the index definition, the same for its price and total return series. */
  indexId: string;
  constituentCount: number;
}

export interface EtfInstrument extends InstrumentBase {
  kind: 'etf';
  issuerId: string;
  issuerName: string;
  /** ID of the tracked index definition. */
  indexId: string;
  /** Total expense ratio p. a. (0.002 = 0.20 %). */
  ter: number;
  distribution: 'accumulating' | 'distributing';
  /** `null` for accumulating ETFs. */
  distributionFrequency: EtfDistributionFrequency | null;
  replication: EtfReplication;
  fundVolume: Cents;
}

export type Instrument = StockInstrument | IndexInstrument | EtfInstrument;

/**
 * Static details that the list doesn't need (TS §8.2, AP 4.1); figures such as volatility, beta,
 * market capitalisation and the dividend history follow in AP 4.5.
 */
export type InstrumentDetails =
  | {
      kind: 'stock';
      id: string;
      /** Template code with its parameter; the text is built in the UI (TS §5.4, §8.6). */
      profile: CompanyProfile;
      foundedYear: number;
      employees: number;
      sharesOutstanding: number;
      freeFloatShares: number;
      dividendFrequency: DividendFrequency;
      /** IDs of the indices the share belongs to, in the order of the world. */
      indexIds: string[];
    }
  | {
      kind: 'index';
      id: string;
      /** Maximum weight of a constituent, `null` without capping. */
      capWeight: number | null;
      /** Level at the epoch. */
      baseValue: number;
    }
  | {
      kind: 'etf';
      id: string;
      /** Yearly ex-date rhythm of the distributions, `null` for accumulating ETFs. */
      distributionSchedule: DividendSchedule | null;
    };
