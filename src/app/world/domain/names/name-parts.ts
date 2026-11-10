import { RegionId, SectorId } from '../models/taxonomy.model';

/** First syllables of fictional name cores (ASCII only, so tickers stay A–Z). */
export const CORE_STARTS: readonly string[] = [
  'Ar',
  'Bel',
  'Cal',
  'Cor',
  'Dar',
  'El',
  'Fen',
  'Gal',
  'Hal',
  'Is',
  'Jor',
  'Kal',
  'Lum',
  'Mar',
  'Nor',
  'Or',
  'Pel',
  'Quin',
  'Ros',
  'Sel',
  'Tal',
  'Ul',
  'Val',
  'Wel',
  'Xan',
  'Yor',
  'Zel',
  'Ast',
  'Bren',
  'Cyr',
  'Dov',
  'Fal',
  'Gor',
  'Hel',
  'Lor',
  'Mer',
  'Nav',
  'Oss',
  'Ser',
  'Tor',
  'Vend',
  'Kor',
];

export const CORE_ENDINGS: readonly string[] = [
  'ara',
  'on',
  'ex',
  'ia',
  'ora',
  'is',
  'an',
  'ix',
  'en',
  'ova',
  'ar',
  'eon',
  'um',
  'ys',
  'ent',
  'ino',
  'ada',
  'ion',
  'ane',
  'oris',
];

/** Name patterns; `{core}` is replaced by a fictional core. */
export const BRANCH_BANK_PATTERNS: readonly string[] = [
  '{core} Bank',
  'Bankhaus {core}',
  '{core}bank',
];
export const DIRECT_BANK_PATTERNS: readonly string[] = [
  '{core} Direkt',
  '{core} Direktbank',
  '{core} Online Bank',
];
export const ONLINE_BROKER_PATTERNS: readonly string[] = [
  '{core} Broker',
  '{core}Trade',
  '{core} Invest',
];
export const NEO_BROKER_PATTERNS: readonly string[] = ['{core}', '{core} Markets', '{core}.app'];
export const ISSUER_PATTERNS: readonly string[] = [
  '{core} Invest',
  '{core} Asset Management',
  '{core} Funds',
  '{core} Capital',
];

export const REGION_INDEX_WORDS: Readonly<Record<RegionId, string>> = {
  'north-america': 'North America',
  europe: 'Europe',
  'asia-pacific': 'Asia Pacific',
  'emerging-markets': 'Emerging Markets',
};

export const SECTOR_INDEX_WORDS: Readonly<Record<SectorId, string>> = {
  technology: 'Technology',
  'health-care': 'Health Care',
  financials: 'Financials',
  energy: 'Energy',
  utilities: 'Utilities',
  industrials: 'Industrials',
  materials: 'Materials',
  'consumer-discretionary': 'Consumer Discretionary',
  'consumer-staples': 'Consumer Staples',
  'communication-services': 'Communication Services',
  'real-estate': 'Real Estate',
};
