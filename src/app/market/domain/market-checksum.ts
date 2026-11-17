import { Checksum } from '@app/simulation/util/checksum';

import { phaseIndex } from './market-context';
import { MarketState } from './models/market-state.model';

/** Checksum over the core market state (32 hex characters, TS §4.6). */
export function marketChecksum(state: Readonly<MarketState>): string {
  return new Checksum()
    .addUint32(state.day)
    .addUint32(phaseIndex(state.phase))
    .addFloat64Array(state.trend)
    .addFloat64Array(state.logVol)
    .addFloat64Array(state.level)
    .addFloat64Array(state.idioClose)
    .addFloat64Array(state.idioTransient)
    .addFloat64Array(state.logClose)
    .addFloat64Array(state.nextExDay)
    .addFloat64Array(state.dividendCents)
    .addFloat64Array(state.indexReinvest)
    .addFloat64Array(state.etfScale)
    .addFloat64Array(state.etfPot)
    .addFloat64Array(state.etfNextExDay)
    .digest();
}
