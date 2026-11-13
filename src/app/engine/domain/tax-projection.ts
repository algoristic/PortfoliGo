import { PlayerState } from './models/game-state.model';
import { TaxesProjection } from './models/taxes-view.model';

/** The tax state for the UI (TS §8.3): copies of the running and the closed tax years. */
export function taxesProjection(player: Readonly<PlayerState>): TaxesProjection {
  return {
    current: { ...player.taxYear },
    closed: player.closedTaxYears.map((year) => ({ ...year })),
  };
}
