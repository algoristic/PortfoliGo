import { ColorScheme } from '@app/shared/data-access/color-scheme/color-scheme-service.utils';

export const COLOR_TOKENS = [
  'bg',
  'surface',
  'surface-raised',
  'border',
  'fg',
  'fg-muted',
  'accent',
  'up',
  'down',
  'warning',
  'chart-1',
  'chart-2',
  'chart-3',
  'chart-4',
  'chart-5',
  'chart-6',
] as const;
export type ColorToken = (typeof COLOR_TOKENS)[number];

export const TEXT_TOKENS = ['fg', 'fg-muted', 'accent', 'up', 'down', 'warning'] as const;
export type TextToken = (typeof TEXT_TOKENS)[number];

export const BACKGROUND_TOKENS = ['bg', 'surface', 'surface-raised'] as const;
export type BackgroundToken = (typeof BACKGROUND_TOKENS)[number];

/** Category colours of charts: graphics, not text (donut segments, overlay lines). */
export const GRAPHIC_TOKENS = [
  'chart-1',
  'chart-2',
  'chart-3',
  'chart-4',
  'chart-5',
  'chart-6',
] as const;
export type GraphicToken = (typeof GRAPHIC_TOKENS)[number];

export const MINIMUM_TEXT_CONTRAST = 4.5;
/** WCAG 2.2 SC 1.4.11 for graphical objects. */
export const MINIMUM_GRAPHIC_CONTRAST = 3;

export interface TokenSwatch {
  token: ColorToken;
  /** Full class names, so that Tailwind finds them when scanning the sources. */
  swatchClass: string;
}

export interface TokenSample {
  token: TextToken;
  textClass: string;
}

export type TokenValues = Partial<Record<ColorToken, string>>;

export interface ContrastRow {
  foreground: TextToken | GraphicToken;
  /** The required ratio: text 4.5:1, graphics 3:1. */
  minimum: number;
  background: BackgroundToken;
  ratio: number;
  passes: boolean;
}

export type ThemeMeasurement = Record<ColorScheme, { values: TokenValues; rows: ContrastRow[] }>;
