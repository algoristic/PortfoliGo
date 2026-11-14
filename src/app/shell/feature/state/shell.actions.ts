import { createAction, props } from '@ngrx/store';

import { PaletteCommand } from '@app/shell/domain/models/command.model';

export const clickedCommandPalette = createAction('[Shell/Page] Clicked command palette');
export const pressedCommandPaletteShortcut = createAction(
  '[Shell/Page] Pressed command palette shortcut',
);
export const selectedPaletteCommand = createAction(
  '[Shell/Page] Selected palette command',
  props<{ command: PaletteCommand }>(),
);
