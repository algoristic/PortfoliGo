import { SpeedId } from '@app/clock/domain/models/speed.model';

/** Areas of the game the palette navigates to, as paths below `/game/:playerId` (TS §11.4). */
export const PALETTE_PAGES = [
  'dashboard',
  'markets',
  'markets/screener',
  'markets/watchlist',
  'portfolio',
  'accounts',
  'banks',
  'orders',
  'taxes',
  'notifications',
  'settings',
  'help',
  'about',
] as const;
export type PalettePage = (typeof PALETTE_PAGES)[number];

/** What a palette entry does when chosen (PS US-UI-05). */
export type PaletteCommand =
  | { kind: 'navigate'; page: PalettePage }
  | { kind: 'instrument'; instrumentId: string }
  | { kind: 'buy'; instrumentId: string }
  | { kind: 'toggle-pause' }
  | { kind: 'speed'; speed: SpeedId }
  | { kind: 'jump' }
  | { kind: 'transfer' }
  | { kind: 'open-account' }
  | { kind: 'export' }
  | { kind: 'switch-player' };

/** The keys of a `keydown` the shortcut check reads. */
export interface ShortcutKeyEvent {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  repeat: boolean;
}
