export const BADGE_TONES = ['neutral', 'accent', 'up', 'down', 'warning'] as const;
export type BadgeTone = (typeof BADGE_TONES)[number];
