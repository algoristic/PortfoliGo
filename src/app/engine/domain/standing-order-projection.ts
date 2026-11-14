import { StandingOrderView } from '@app/banking/domain/models/standing-order.model';
import { nextExecution } from '@app/banking/domain/standing-order-logic';
import { Tick, TICKS_PER_MINUTE } from '@app/clock/domain/models/time.model';

import { PlayerState } from './models/game-state.model';

/**
 * The standing orders for the UI (TS §8.3, AP 5.6a), in the order they were created, each with its
 * next execution after the engine's tick `tick` (the bank run at or after the next tick); `null`
 * when paused. A few per player, so the projection always carries all of them.
 */
export function standingOrderViews(player: Readonly<PlayerState>, tick: Tick): StandingOrderView[] {
  return player.standingOrders.map((order) => ({
    ...order,
    nextExecution: nextExecution(order, tick + TICKS_PER_MINUTE),
  }));
}
