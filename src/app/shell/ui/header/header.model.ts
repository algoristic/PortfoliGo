export const PLAYER_MENU_ACTIONS = [
  'switch-player',
  'settings',
  'about',
  'help',
  'export',
] as const;
export type PlayerMenuAction = (typeof PLAYER_MENU_ACTIONS)[number];
