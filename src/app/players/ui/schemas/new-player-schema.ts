import { apply, required, schema, validate } from '@angular/forms/signals';

import {
  LIVING_COSTS_RANGE,
  NET_INCOME_RANGE,
  START_CAPITAL_RANGE,
} from '@app/players/domain/player-limits';
import { playerSeedError } from '@app/players/domain/player-logic';

import { amountRangeSchema } from './amount-range-schema';
import { playerNameSchema } from './player-name-schema';

import { NewPlayerFormModel } from '../models/new-player-form.model';

/**
 * Rules of the form „Spieler anlegen“ (PS US-SP-01). Living costs above the income are no error;
 * the form shows a hint with `livingCostsExceedIncome` (`players/domain/player-logic`).
 */
export const newPlayerSchema = schema<NewPlayerFormModel>((path) => {
  apply(path.name, playerNameSchema);
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
