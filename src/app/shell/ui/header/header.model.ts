export const PLAYER_MENU_ACTIONS = ['switch-player', 'settings', 'about', 'export'] as const;
export type PlayerMenuAction = (typeof PLAYER_MENU_ACTIONS)[number];
