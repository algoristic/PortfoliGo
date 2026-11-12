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
] as const;
export type ColorToken = (typeof COLOR_TOKENS)[number];

export const TEXT_TOKENS = ['fg', 'fg-muted', 'accent', 'up', 'down', 'warning'] as const;
export type TextToken = (typeof TEXT_TOKENS)[number];

export const BACKGROUND_TOKENS = ['bg', 'surface', 'surface-raised'] as const;
export type BackgroundToken = (typeof BACKGROUND_TOKENS)[number];

export const MINIMUM_TEXT_CONTRAST = 4.5;

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
  foreground: TextToken;
  background: BackgroundToken;
  ratio: number;
  passes: boolean;
}

export type ThemeMeasurement = Record<ColorScheme, { values: TokenValues; rows: ContrastRow[] }>;
