/** Terms of the glossary (PS US-UI-06, TS §11.4); the texts live in `help/ui/labels`. */
export const GLOSSARY_TERM_IDS = [
  'depot',
  'clearing-account',
  'current-account',
  'savings-account',
  'salary-account',
  'overdraft',
  'tolerated-overdraft',
  'order-types',
  'market-order',
  'limit-order',
  'stop-order',
  'stop-limit-order',
  'validity',
  'reservation',
  'spread',
  'fractional-shares',
  'order-fee',
  'custody-fee',
  'savings-plan',
  'standing-order',
  'dividend',
  'ex-date',
  'etf',
  'ter',
  'distribution',
  'index',
  'capital-gains-tax',
  'saver-allowance',
  'loss-pot',
  'lot-fifo',
  'net-worth',
  'twr',
  'benchmark',
  'volatility',
  'beta',
  'market-cap',
  'savings-rate',
  'trading-hours',
  'game-speed',
  'jump',
  'auto-pause',
  'background-modes',
] as const;
export type GlossaryTermId = (typeof GLOSSARY_TERM_IDS)[number];

export const GLOSSARY_CATEGORIES = [
  'accounts',
  'orders',
  'costs',
  'income',
  'taxes',
  'performance',
  'time',
] as const;
export type GlossaryCategory = (typeof GLOSSARY_CATEGORIES)[number];

export interface GlossaryTerm {
  id: GlossaryTermId;
  category: GlossaryCategory;
  /** Terms the entry links as „Siehe auch“. */
  related: readonly GlossaryTermId[];
}
