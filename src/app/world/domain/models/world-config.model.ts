import { BankType, InterestPayout } from '@app/banking/domain/models/bank-conditions.model';

import { EtfReplication } from './etf.model';
import { IndexKind } from './market-index.model';
import { Cyclicality, RegionId, SectorId, SizeClass, Style } from './taxonomy.model';

/** Closed interval `[min, max]`. */
export type Range = readonly [number, number];

/** Lognormal distribution given by its median and the standard deviation of the logarithm. */
export interface LognormalSpec {
  median: number;
  sigma: number;
  min: number;
  max: number;
}

export interface CompanyConfig {
  count: number;
  /** Relative weights; companies are allocated to countries by largest remainder. */
  regionWeights: Readonly<Record<RegionId, number>>;
  /** Weights of the countries within their region. */
  countryWeights: Readonly<Record<string, number>>;
  /** Market capitalisation in euros. */
  marketCap: LognormalSpec;
  /** Lower bounds (euros) of the large and mid cap classes. */
  sizeThresholds: { large: number; mid: number };
  /** Share price at the epoch in euros (TS §5.4: 5–500 €). */
  startPrice: LognormalSpec;
  freeFloat: Range;
  foundedYear: Readonly<Record<SizeClass, Range>>;
  /** Market capitalisation per employee in euros. */
  marketCapPerEmployee: Range;
  /** Standard deviation added to the style tilt of the industry. */
  styleNoise: number;
  /** Probability that a company deviates from the cyclicality of its industry by one step. */
  cyclicalityDeviation: number;
  dividendStyleFactor: Readonly<Record<Style, number>>;
  maxDividendYield: number;
  worldBeta: Readonly<Record<Cyclicality, Range>>;
  regionLoading: Range;
  sectorLoading: Range;
  industryLoading: Range;
  styleLoading: Readonly<Record<Style, Range>>;
  sizeLoading: Readonly<Record<SizeClass, Range>>;
  idioVol: Readonly<Record<SizeClass, Range>>;
  alphaSd: number;
  jumpIntensity: Range;
  jumpMean: number;
  jumpSd: Range;
  /** Upper volatility bounds of risk classes 1–4 (total volatility p. a.); above is class 5. */
  riskClassBounds: readonly [number, number, number, number];
  /** Assumed world factor volatility for the risk class. */
  riskClassMarketVol: number;
  savingsPlanSizes: readonly SizeClass[];
}

export interface IndexConfig {
  leadingSize: Readonly<Record<RegionId, number>>;
  dividendSize: number;
  capWeight: Readonly<Record<IndexKind, number | null>>;
  baseValue: number;
}

export interface EtfProductConfig {
  kind: IndexKind;
  regionId?: RegionId;
  sectorId?: SectorId;
  count: number;
  ter: Range;
  /** Probability of a distributing share class. */
  distributingShare: number;
}

export interface EtfConfig {
  issuerCount: number;
  exchangeId: string;
  products: readonly EtfProductConfig[];
  replicationWeights: Readonly<Record<EtfReplication, number>>;
  /** Share of quarterly distributions among distributing ETFs (the rest is annual). */
  quarterlyShare: number;
  /** Fund volume in euros. */
  fundVolume: LognormalSpec;
  /** NAV at the epoch in euros. */
  startPrice: LognormalSpec;
}

/** Ranges of the conditions per bank type (TS §5.7); amounts in euros, rates as fractions. */
export interface BranchBankRanges {
  monthlyFee: Range;
  overdraftRate: Range;
  toleratedSurcharge: Range;
  savingsRate: Range;
  custodyRate: Range;
  custodyMin: Range;
  orderRate: number;
  orderMin: number;
  orderMax: number;
  exchangeFee: Range;
  savingsPlanRate: Range;
  clearingDebitRate: Range;
}

export interface DirectBankRanges {
  monthlyFee: Range;
  feeWaiverMinDeposits: number;
  overdraftRate: Range;
  toleratedSurcharge: Range;
  savingsRate: Range;
  orderFlat: Range;
  orderRate: number;
  orderMax: Range;
  savingsPlanRate: Range;
  clearingDebitRate: Range;
}

export interface OnlineBrokerRanges {
  orderFlat: Range;
  exchangeFee: Range;
  savingsPlanFlat: Range;
  clearingDebitRate: Range;
}

export interface NeoBrokerRanges {
  orderFlat: Range;
  clearingRate: Range;
  clearingDebitRate: Range;
  spreadMarkup: Range;
}

export interface BankConfig {
  composition: readonly { type: BankType; count: Range }[];
  overdraftLimitIncomeFactor: number;
  savingsPayoutWeights: Readonly<Record<InterestPayout, number>>;
  branch: BranchBankRanges;
  direct: DirectBankRanges;
  onlineBroker: OnlineBrokerRanges;
  neoBroker: NeoBrokerRanges;
}

/** All quantities and distributions of a world in one place, for calibration in the lab (TS §5.2). */
export interface WorldConfig {
  companies: CompanyConfig;
  indices: IndexConfig;
  etfs: EtfConfig;
  banks: BankConfig;
}
