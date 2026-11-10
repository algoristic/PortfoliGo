export const PRICE_CHANGE_MODES = ['percent', 'cents'] as const;
export type PriceChangeMode = (typeof PRICE_CHANGE_MODES)[number];
