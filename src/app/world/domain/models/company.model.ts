import {
  Cyclicality,
  DividendFrequency,
  RegionId,
  RiskClass,
  SectorId,
  SizeClass,
  Style,
} from './taxonomy.model';

import { Cents } from '../../../shared/domain/models/money.model';

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

export interface DividendProfile {
  /** Target dividend yield (0.03 = 3 %); 0 for companies without a dividend. */
  yield: number;
  frequency: DividendFrequency | null;
  /** `null` for companies without a dividend. */
  schedule: DividendSchedule | null;
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
