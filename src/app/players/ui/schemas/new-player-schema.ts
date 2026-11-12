import { apply, required, schema, validate } from '@angular/forms/signals';

import {
  LIVING_COSTS_RANGE,
  NET_INCOME_RANGE,
  PLAYER_NAME_MAX_LENGTH,
  START_CAPITAL_RANGE,
} from '@app/players/domain/player-limits';
import { playerNameError, playerSeedError } from '@app/players/domain/player-logic';

import { amountRangeSchema } from './amount-range-schema';

import { NewPlayerFormModel } from '../models/new-player-form.model';

/**
 * Rules of the form „Spieler anlegen“ (PS US-SP-01). Living costs above the income are no error;
 * the form shows a hint with `livingCostsExceedIncome` (`players/domain/player-logic`).
 */
export const newPlayerSchema = schema<NewPlayerFormModel>((path) => {
  // `required` reports an empty field (and marks the field as required); the validators add what
  // only the domain rules know, such as a name of blanks.
  required(path.name, {
    message: $localize`:@@uiPlayers-newPlayerSchema-nameRequired:Bitte gib einen Namen ein.`,
  });
  validate(path.name, ({ value }) => {
    const maxLength = PLAYER_NAME_MAX_LENGTH;
    switch (value() === '' ? null : playerNameError(value())) {
      case 'required':
        return {
          kind: 'required',
          message: $localize`:@@uiPlayers-newPlayerSchema-nameBlank:Bitte gib einen Namen ein.`,
        };
      case 'too-long':
        return {
          kind: 'too-long',
          message: $localize`:@@uiPlayers-newPlayerSchema-nameTooLong:Der Name darf höchstens ${maxLength}:maxLength: Zeichen haben.`,
        };
      default:
        return null;
    }
  });
  required(path.seed, {
    message: $localize`:@@uiPlayers-newPlayerSchema-seedRequired:Bitte gib einen Seed ein.`,
  });
  validate(path.seed, ({ value }) =>
    value() !== '' && playerSeedError(value()) === 'required'
      ? {
          kind: 'required',
          message: $localize`:@@uiPlayers-newPlayerSchema-seedBlank:Bitte gib einen Seed ein.`,
        }
      : null,
  );
  apply(path.startCapital, amountRangeSchema(START_CAPITAL_RANGE));
  apply(path.netIncome, amountRangeSchema(NET_INCOME_RANGE));
  apply(path.livingCosts, amountRangeSchema(LIVING_COSTS_RANGE));
});
