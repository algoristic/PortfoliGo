export const PLAYER_MENU_ACTIONS = ['switch-player', 'settings', 'export'] as const;
export type PlayerMenuAction = (typeof PLAYER_MENU_ACTIONS)[number];
