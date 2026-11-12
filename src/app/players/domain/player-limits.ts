import { StartConditions } from '@app/engine/domain/models/game-state.model';
import { Cents } from '@app/shared/domain/models/money.model';

import { PlayerPreset } from './models/player.model';

// Limits, default and presets of a new player (PS US-SP-01, E-14). Amounts in cents.

export const PLAYER_NAME_MAX_LENGTH = 40;

export interface AmountRange {
  min: Cents;
  max: Cents;
}

export const START_CAPITAL_RANGE: AmountRange = { min: 0, max: 100_000_000 };
export const NET_INCOME_RANGE: AmountRange = { min: 0, max: 5_000_000 };
export const LIVING_COSTS_RANGE: AmountRange = { min: 0, max: 5_000_000 };

export const PLAYER_PRESETS: readonly PlayerPreset[] = [
  { id: 'student', start: { startCapital: 200_000, netIncome: 100_000, livingCosts: 90_000 } },
  {
    id: 'career-start',
    start: { startCapital: 1_000_000, netIncome: 250_000, livingCosts: 180_000 },
  },
  {
    id: 'experienced',
    start: { startCapital: 5_000_000, netIncome: 450_000, livingCosts: 300_000 },
  },
];

/** The default equals the preset „Berufseinstieg“. */
export const DEFAULT_START_CONDITIONS: StartConditions = {
  startCapital: 1_000_000,
  netIncome: 250_000,
  livingCosts: 180_000,
};
