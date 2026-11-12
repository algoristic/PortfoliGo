import { exDayOnOrAfter } from './dividend-logic';
import { isMarketDay } from './market-calendar';
import { MarketContext } from './market-context';
import { MarketDay } from './models/market-day.model';
import { MarketState } from './models/market-state.model';

import { CENTS_PER_EURO } from '../../shared/domain/models/money.model';
import { eurosToCentsDown } from '../../shared/domain/money-logic';
import { normal } from '../../simulation/util/distributions';

const CALENDAR_DAYS_PER_YEAR = 365;

/**
 * Day step of the ETFs (TS §6.6) after the indices: advances the scale `k` by the TER of every
 * calendar day since the last trading day and the tracking noise, then the distribution pot over
 * the boundaries of the day. The tracking noise comes from one stream per day for all ETFs
 * (`market/etfs/<day>`, one draw per ETF in ETF order); one stream per ETF would cost about 25 ms
 * of the prehistory budget. New ETFs are appended, so they do not move the others. On its ex-date, a
 * distributing ETF pays out the pot of the previous close in whole cents at its open, before the
 * dividends of the same boundary flow in; the remainder stays in the pot. Needs no minute values.
 */
export function stepEtfs(context: MarketContext, state: MarketState, out: MarketDay): void {
  const { etfs, layout } = context;
  const boundaryCount = layout.boundaries.length;
  const day = out.day;
  const calendarDays = calendarDaysSinceLastMarketDay(day);
  const rng = context.etfStreams.create(day);
  for (let e = 0; e < etfs.ids.length; e++) {
    const dailyCost = 1 - etfs.ter[e] / CALENDAR_DAYS_PER_YEAR;
    let scale = state.etfScale[e];
    for (let n = 0; n < calendarDays; n++) {
      scale *= dailyCost;
    }
    scale *= 1 + etfs.dailyTrackingSd[e] * normal(rng);
    state.etfScale[e] = scale;
    out.etfScale[e] = scale;

    const potStart = e * boundaryCount;
    const distribution = etfs.distributions[e];
    out.etfExCents[e] = 0;
    if (distribution === null) {
      out.etfPot.fill(0, potStart, potStart + boundaryCount);
      continue;
    }
    let pot = state.etfPot[e];
    let payout = 0;
    if (day === state.etfNextExDay[e]) {
      payout = Math.max(0, eurosToCentsDown(pot));
      out.etfExCents[e] = payout;
      state.etfNextExDay[e] = exDayOnOrAfter(
        distribution.schedule,
        distribution.frequency,
        day + 1,
      );
    }
    const x = etfs.indexOf[e];
    const openBoundary = etfs.openBoundary[e];
    for (let j = 0; j < boundaryCount; j++) {
      if (j === openBoundary && payout > 0) {
        pot -= payout / CENTS_PER_EURO;
      }
      const points = out.indexDividendPoints[x * boundaryCount + j];
      if (points > 0) {
        pot += scale * points;
      }
      out.etfPot[potStart + j] = pot;
    }
    state.etfPot[e] = pot;
  }
}

/** Calendar days since the previous market day (1 on Tuesday to Friday, 3 on Monday). */
export function calendarDaysSinceLastMarketDay(day: number): number {
  let days = 1;
  while (day - days >= 0 && !isMarketDay(day - days)) {
    days++;
  }
  return days;
}
