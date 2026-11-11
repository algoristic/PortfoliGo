import { MarketContext } from './market-context';
import { LOADINGS_PER_INSTRUMENT } from './market-layout';
import { MarketDay } from './models/market-day.model';

import { normal, poisson, uniformInt } from '../../simulation/util/distributions';

/**
 * Day step of instrument i (TS §6.4) after the factor step of the same day. Writes open, close
 * and jumps into `out` and returns the idiosyncratic component at the close.
 *
 * Stream `market/instrument/<id>/<day>`, draw order: overnight shock, session shock, number of
 * jumps, then minute and size of each jump. The bridge of AP 1.5 uses a separate stream.
 * The ex-dividend markdown at the open follows in AP 1.6 (TS §6.5).
 */
export function stepInstrument(
  context: MarketContext,
  i: number,
  day: number,
  idioClosePrevious: number,
  out: MarketDay,
): number {
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

  const idioOpen =
    idioClosePrevious + context.sqrtOvernightShare * vol * sqrtDayYears * overnightShock;
  const idioClose =
    idioOpen +
    (layout.alpha[i] - 0.5 * vol * vol) * dayYears +
    context.sqrtSessionShare * vol * sqrtDayYears * sessionShock +
    jumpSum;

  let factorOpen = 0;
  let factorClose = 0;
  for (let l = 0; l < LOADINGS_PER_INSTRUMENT; l++) {
    const index = i * LOADINGS_PER_INSTRUMENT + l;
    const base = layout.loadingFactors[index] * boundaryCount;
    factorOpen += layout.loadings[index] * out.factorLevels[base + openBoundary];
    factorClose += layout.loadings[index] * out.factorLevels[base + closeBoundary];
  }
  out.idioOpen[i] = idioOpen;
  out.idioClose[i] = idioClose;
  out.logOpen[i] = layout.logBase[i] + factorOpen + idioOpen;
  out.logClose[i] = layout.logBase[i] + factorClose + idioClose;
  return idioClose;
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
