import { required, schema, validate } from '@angular/forms/signals';

import { PLAYER_NAME_MAX_LENGTH } from '@app/players/domain/player-limits';
import { playerNameError } from '@app/players/domain/player-logic';

/** Name of a player: 1–40 characters after trimming (PS US-SP-01); creating and renaming. */
export const playerNameSchema = schema<string>((path) => {
  // `required` reports an empty field (and marks the field as required); the validator adds what
  // only the domain rule knows, such as a name of blanks.
  required(path, {
    message: $localize`:@@uiPlayers-playerNameSchema-required:Bitte gib einen Namen ein.`,
  });
  validate(path, ({ value }) => {
    const maxLength = PLAYER_NAME_MAX_LENGTH;
    switch (value() === '' ? null : playerNameError(value())) {
      case 'required':
        return {
          kind: 'required',
          message: $localize`:@@uiPlayers-playerNameSchema-blank:Bitte gib einen Namen ein.`,
        };
      case 'too-long':
        return {
          kind: 'too-long',
          message: $localize`:@@uiPlayers-playerNameSchema-tooLong:Der Name darf höchstens ${maxLength}:maxLength: Zeichen haben.`,
        };
      default:
        return null;
    }
  });
});
