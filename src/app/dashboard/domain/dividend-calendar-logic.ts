import { Tick } from '@app/clock/domain/models/time.model';
import { distributionAmount } from '@app/portfolio/domain/distribution-logic';

import { DividendCalendarEntry } from './models/dividend-calendar.model';
import { UpcomingInputs } from './models/upcoming.model';

/**
 * The dividend calendar for depot and watchlist (US-MK-06, TS §8.1): every announced ex-date after
 * `fromTick` of a held instrument (shares and expected amount summed over the depots, each depot
 * rounded like its payout) or of a watchlist instrument without a holding, and every earned payout
 * whose payment date is still to come (summed per instrument and ex-date). Sorted by ex-date, then
 * instrument ID. No window: the market announces amounts at most 20 market days
 * ahead (TS §6.5), and unannounced dates are left out.
 */
export function dividendCalendar(
  fromTick: Tick,
  inputs: Pick<UpcomingInputs, 'announcedDividends' | 'pendingDistributions' | 'watchedDividends'>,
): DividendCalendarEntry[] {
  const entries = new Map<string, DividendCalendarEntry>();
  const add = (
    key: string,
    entry: Omit<DividendCalendarEntry, 'quantity' | 'expected'>,
    quantity: number,
    amount: number,
  ): void => {
    const known = entries.get(key);
    entries.set(key, {
      ...entry,
      quantity: (known?.quantity ?? 0) + quantity,
      expected: (known?.expected ?? 0) + amount,
    });
  };
  for (const pending of inputs.pendingDistributions) {
    if (pending.paymentTick > fromTick) {
      const { instrumentId, exTick, paymentTick, cents, quantity, amount } = pending;
      add(
        `earned|${instrumentId}|${exTick}`,
        { instrumentId, exTick, paymentTick, perShare: cents, earned: true },
        quantity,
        amount,
      );
    }
  }
  for (const dividend of inputs.announcedDividends) {
    if (dividend.exTick > fromTick) {
      const { instrumentId, exTick, paymentTick, cents, quantity } = dividend;
      add(
        `${instrumentId}|${exTick}`,
        { instrumentId, exTick, paymentTick, perShare: cents, earned: false },
        quantity,
        distributionAmount(quantity, cents),
      );
    }
  }
  for (const watched of inputs.watchedDividends) {
    const key = `${watched.instrumentId}|${watched.exTick}`;
    if (watched.exTick > fromTick && !entries.has(key)) {
      const { instrumentId, exTick, paymentTick, cents } = watched;
      entries.set(key, {
        instrumentId,
        exTick,
        paymentTick,
        perShare: cents,
        quantity: null,
        expected: null,
        earned: false,
      });
    }
  }
  return [...entries.values()].sort(
    (a, b) => a.exTick - b.exTick || (a.instrumentId < b.instrumentId ? -1 : 1),
  );
}
