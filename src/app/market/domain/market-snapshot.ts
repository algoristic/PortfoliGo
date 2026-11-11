import { MarketSnapshot, MarketState } from './models/market-state.model';

/** Copy of the core state; caches and the factor history are rebuilt and never stored (TS §6.1). */
export function snapshotMarket(state: Readonly<MarketState>): MarketSnapshot {
  return copyState(state);
}

export function restoreMarket(snapshot: MarketSnapshot): MarketState {
  return copyState(snapshot);
}

function copyState(state: Readonly<MarketState>): MarketState {
  return {
    day: state.day,
    phase: state.phase,
    trend: state.trend.slice(),
    logVol: state.logVol.slice(),
    level: state.level.slice(),
    idioClose: state.idioClose.slice(),
    logClose: state.logClose.slice(),
    nextExDay: state.nextExDay.slice(),
    dividendCents: state.dividendCents.slice(),
    indexReinvest: state.indexReinvest.slice(),
  };
}
