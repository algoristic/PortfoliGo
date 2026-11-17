export const CARD_PADDINGS = ['none', 'sm', 'md', 'lg'] as const;
export type CardPadding = (typeof CARD_PADDINGS)[number];

export const CARD_SURFACES = ['default', 'raised'] as const;
export type CardSurface = (typeof CARD_SURFACES)[number];
