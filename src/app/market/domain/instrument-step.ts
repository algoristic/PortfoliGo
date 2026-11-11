import { announcementDay, dividendCents, exDayOnOrAfter, exMarkdown } from './dividend-logic';
import { MarketContext } from './market-context';
import { LOADINGS_PER_INSTRUMENT } from './market-layout';
import { MarketDay } from './models/market-day.model';
import { InstrumentState } from './models/market-state.model';
import { priceFromLog } from './price-logic';

import { CENTS_PER_EURO } from '../../shared/domain/models/money.model';
import { normal, poisson, uniformInt } from '../../simulation/util/distributions';

/** 20 market days are at most 28 calendar days; earlier days skip the exact check. */
const MAX_ANNOUNCEMENT_CALENDAR_DAYS = 28;

/**
 * Day step of instrument i (TS §6.4, §6.5) after the factor step of the same day. Writes open,
 * close, jumps and dividend events into `out` and advances the instrument's part of `state`.
 *
 * Stream `market/instrument/<id>/<day>`, draw order: overnight shock, session shock, number of
 * jumps, then minute and size of each jump. The bridge uses a separate stream. Dividends draw
 * nothing: the amount follows from the close before the announcement, the markdown is applied
 * at the open after the overnight shock.
 */
export function stepInstrument(
  context: MarketContext,
  i: number,
  day: number,
  state: InstrumentState,
  out: MarketDay,
): void {
  const { layout, dayYears, sqrtDayYears } = context;
  const rng = context.instrumentStreams[i].create(day);
  const vol = layout.idioVol[i];
  const overnightShock = normal(rng);
  const sessionShock = normal(rng);
  const jumpCount = poisson(rng, context.dailyJumpRate[i], context.noJumpProbability[i]);

  const boundaryCount = layout.boundaries.length;
  const openBoundary = layout.openBoundary[i];
  const closeBoundary = layout.closeBoundary[i];
  const open = layout.boundaries[openBoundary];
  const close = layout.boundaries[closeBoundary];

  ensureJumpCapacity(out, out.jumpTotal + jumpCount);
  const start = out.jumpTotal;
  let jumpSum = 0;
  for (let n = 0; n < jumpCount; n++) {
    const minute = open + uniformInt(rng, 1, close - open);
    const size = normal(rng, layout.jumpMean[i], layout.jumpSd[i]);
    // Insertion sort by minute; jumps with the same minute keep their draw order.
    let position = start + n;
    while (position > start && out.jumpMinute[position - 1] > minute) {
      out.jumpMinute[position] = out.jumpMinute[position - 1];
      out.jumpSize[position] = out.jumpSize[position - 1];
      position--;
    }
    out.jumpMinute[position] = minute;
    out.jumpSize[position] = size;
  }
  for (let n = 0; n < jumpCount; n++) {
    jumpSum += out.jumpSize[start + n];
  }
  out.jumpStart[i] = start;
  out.jumpCount[i] = jumpCount;
  out.jumpTotal = start + jumpCount;

  let factorOpen = 0;
  let factorClose = 0;
  for (let l = 0; l < LOADINGS_PER_INSTRUMENT; l++) {
    const index = i * LOADINGS_PER_INSTRUMENT + l;
    const base = layout.loadingFactors[index] * boundaryCount;
    factorOpen += layout.loadings[index] * out.factorLevels[base + openBoundary];
    factorClose += layout.loadings[index] * out.factorLevels[base + closeBoundary];
  }

  const prevLogClose = state.logClose[i];
  out.prevLogClose[i] = prevLogClose;
  out.prevIdioClose[i] = state.idioClose[i];
  announceDividend(context, i, day, state, out);

  let idioOpen =
    state.idioClose[i] + context.sqrtOvernightShare * vol * sqrtDayYears * overnightShock;
  out.exDividendCents[i] = 0;
  const dividend = layout.dividends[i];
  if (dividend !== null && day === state.nextExDay[i]) {
    const cents = state.dividendCents[i];
    if (cents > 0) {
      const floor = context.config.priceFloor;
      const openPrice = priceFromLog(layout.logBase[i] + factorOpen + idioOpen, floor);
      idioOpen -= exMarkdown(openPrice, cents / CENTS_PER_EURO, floor);
    }
    out.exDividendCents[i] = cents;
    state.nextExDay[i] = exDayOnOrAfter(dividend.schedule, dividend.frequency, day + 1);
    state.dividendCents[i] = Number.NaN;
  }
  const idioClose =
    idioOpen +
    (layout.alpha[i] - 0.5 * vol * vol) * dayYears +
    context.sqrtSessionShare * vol * sqrtDayYears * sessionShock +
    jumpSum;

  const logClose = layout.logBase[i] + factorClose + idioClose;
  out.idioOpen[i] = idioOpen;
  out.idioClose[i] = idioClose;
  out.logOpen[i] = layout.logBase[i] + factorOpen + idioOpen;
  out.logClose[i] = logClose;
  state.idioClose[i] = idioClose;
  state.logClose[i] = logClose;
}

/**
 * Announces the dividend of the next ex-date on its announcement day (TS §6.5): target yield ×
 * close of the previous trading day ÷ frequency. Ex-dates whose announcement lies before the
 * epoch are announced on the first trading day with the start price.
 */
function announceDividend(
  context: MarketContext,
  i: number,
  day: number,
  state: InstrumentState,
  out: MarketDay,
): void {
  out.announcedCents[i] = 0;
  out.announcedExDay[i] = -1;
  const exDay = state.nextExDay[i];
  const dividend = context.layout.dividends[i];
  if (
    dividend === null ||
    !Number.isNaN(state.dividendCents[i]) ||
    day < exDay - MAX_ANNOUNCEMENT_CALENDAR_DAYS ||
    day < announcementDay(exDay)
  ) {
    return;
  }
  const cents = dividendCents(
    dividend.yield,
    dividend.frequency,
    priceFromLog(state.logClose[i], context.config.priceFloor),
  );
  state.dividendCents[i] = cents;
  out.announcedCents[i] = cents;
  out.announcedExDay[i] = exDay;
}

function ensureJumpCapacity(day: MarketDay, required: number): void {
  if (required <= day.jumpMinute.length) {
    return;
  }
  const capacity = Math.max(required, day.jumpMinute.length * 2);
  const minutes = new Int32Array(capacity);
  const sizes = new Float64Array(capacity);
  minutes.set(day.jumpMinute.subarray(0, day.jumpTotal));
  sizes.set(day.jumpSize.subarray(0, day.jumpTotal));
  day.jumpMinute = minutes;
  day.jumpSize = sizes;
}
