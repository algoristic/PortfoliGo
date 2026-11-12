import { Cents } from '@app/shared/domain/models/money.model';

import {
  Cyclicality,
  DividendFrequency,
  RegionId,
  RiskClass,
  SectorId,
  SizeClass,
  Style,
} from './taxonomy.model';

export const PROFILE_TEMPLATES = [
  'market-leader',
  'challenger',
  'specialist',
  'family-owned',
] as const;
export type ProfileTemplate = (typeof PROFILE_TEMPLATES)[number];

/** Short profile as a template code with parameters; the text is built in the UI (TS §8.6). */
export interface CompanyProfile {
  template: ProfileTemplate;
  focus: string;
}

/** Loadings on the factors of TS §6.2. */
export interface FactorLoadings {
  world: number;
  region: number;
  sector: number;
  industry: number;
  /** Value–growth factor; negative for value, positive for growth. */
  style: number;
  /** Small–large factor; positive for small caps. */
  size: number;
}

/** Start values for the market model (TS §6.4); calibrated in AP 1.9. */
export interface CompanyModelParams {
  loadings: FactorLoadings;
  /** Idiosyncratic volatility p. a. */
  idioVol: number;
  /** Permanent idiosyncratic drift p. a. */
  alpha: number;
  /** Expected number of jumps per year. */
  jumpIntensity: number;
  jumpMean: number;
  jumpSd: number;
}

/**
 * Fixed yearly rhythm of the ex-dates (TS §6.5): the ex-date is the first market day on or after
 * `day` of `firstMonth` and repeats every `12 / dividends per year` months.
 */
export interface DividendSchedule {
  /** Month of the first ex-date in the year, `1 … 12 / dividends per year`. */
  firstMonth: number;
  /** Day of the month, `1 … 28`. */
  day: number;
}

/**
 * Dividend policy (TS §5.4, §6.5). Every company has a frequency and a rhythm; companies without a
 * dividend at the epoch start to pay at `startDay` (E-33). The market moves the target yield over
 * the decades (dividend lifecycle).
 */
export interface DividendProfile {
  /** Target dividend yield at the epoch (0.03 = 3 %); 0 for companies that start to pay later. */
  yield: number;
  /** Frequency of the region (TS §6.5). */
  frequency: DividendFrequency;
  /** Drawn after the companies (stream `world/dividends`); `null` only in drafts before that. */
  schedule: DividendSchedule | null;
  /** Day from which the company pays: 0 for payers at the epoch, later for the others. */
  startDay: number;
}

export interface Company {
  id: string;
  name: string;
  ticker: string;
  isin: string;
  regionId: RegionId;
  countryId: string;
  exchangeId: string;
  sectorId: SectorId;
  industryId: string;
  foundedYear: number;
  employees: number;
  size: SizeClass;
  style: Style;
  cyclicality: Cyclicality;
  riskClass: RiskClass;
  /** Share price at the epoch in euros. */
  startPrice: number;
  sharesOutstanding: number;
  freeFloatShares: number;
  /** Market capitalisation at the epoch (start price × shares outstanding). */
  marketCap: Cents;
  savingsPlanEligible: boolean;
  profile: CompanyProfile;
  dividend: DividendProfile;
  model: CompanyModelParams;
}
