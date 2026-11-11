export const REGION_IDS = ['north-america', 'europe', 'asia-pacific', 'emerging-markets'] as const;
export type RegionId = (typeof REGION_IDS)[number];

export const SECTOR_IDS = [
  'technology',
  'health-care',
  'financials',
  'energy',
  'utilities',
  'industrials',
  'materials',
  'consumer-discretionary',
  'consumer-staples',
  'communication-services',
  'real-estate',
] as const;
export type SectorId = (typeof SECTOR_IDS)[number];

export const SIZE_CLASSES = ['large', 'mid', 'small'] as const;
export type SizeClass = (typeof SIZE_CLASSES)[number];

export const STYLES = ['value', 'blend', 'growth'] as const;
export type Style = (typeof STYLES)[number];

export const CYCLICALITIES = ['defensive', 'neutral', 'cyclical'] as const;
export type Cyclicality = (typeof CYCLICALITIES)[number];

export const DIVIDEND_FREQUENCIES = ['annual', 'semi-annual', 'quarterly'] as const;
export type DividendFrequency = (typeof DIVIDEND_FREQUENCIES)[number];

export const DIVIDENDS_PER_YEAR: Readonly<Record<DividendFrequency, number>> = {
  annual: 1,
  'semi-annual': 2,
  quarterly: 4,
};

/** Volatility class 1 (low) to 5 (high). */
export type RiskClass = 1 | 2 | 3 | 4 | 5;

export interface Region {
  id: RegionId;
  /** Distribution frequency of companies in this region (TS §6.5). */
  dividendFrequency: DividendFrequency;
}

export interface Country {
  /** ISO 3166-1 alpha-2 code. */
  id: string;
  regionId: RegionId;
  /** Legal forms used in company names (e.g. `AG`, `SE`). */
  legalForms: readonly string[];
}

export interface Exchange {
  id: string;
  countryId: string;
  /** Fictional name. */
  name: string;
  /** Trading hours as minutes of the game day (TS §3.3); `open < close`. */
  open: number;
  close: number;
}

export interface Sector {
  id: SectorId;
}

/** Tendencies of an industry; the generator adds randomness per company. */
export interface Industry {
  id: string;
  sectorId: SectorId;
  /** Relative frequency among generated companies. */
  weight: number;
  /** Style tilt from −1 (value) to +1 (growth). */
  styleTilt: number;
  cyclicality: Cyclicality;
  /** Range of the target dividend yield for paying companies. */
  dividendYield: readonly [number, number];
  /** Share of companies without a dividend. */
  noDividendShare: number;
  /** Multiplier for the idiosyncratic volatility. */
  volatilityFactor: number;
  /** Word stems for company names. */
  nameStems: readonly string[];
  /** Business focus codes for the profile text (mapped to texts in the UI). */
  focusCodes: readonly string[];
}
