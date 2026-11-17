export const FIELD_SIZES = ['sm', 'md', 'auto'] as const;
export type FieldSize = (typeof FIELD_SIZES)[number];

export const FIELD_BACKGROUNDS = ['surface', 'bg'] as const;
export type FieldBackground = (typeof FIELD_BACKGROUNDS)[number];
