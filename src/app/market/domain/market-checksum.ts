import { phaseIndex } from './market-context';
import { MarketState } from './models/market-state.model';

import { Checksum } from '../../simulation/util/checksum';

/** Checksum over the core market state (32 hex characters, TS §4.6). */
export function marketChecksum(state: Readonly<MarketState>): string {
  return new Checksum()
    .addUint32(state.day)
    .addUint32(phaseIndex(state.phase))
    .addFloat64Array(state.trend)
    .addFloat64Array(state.logVol)
    .addFloat64Array(state.level)
    .addFloat64Array(state.idioClose)
    .digest();
}
