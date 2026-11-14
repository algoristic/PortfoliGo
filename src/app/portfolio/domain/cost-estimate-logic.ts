import { Cents, MicroUnits } from '@app/shared/domain/models/money.model';
import { marketValue } from '@app/shared/domain/money-logic';

/** The market model charges the TER per calendar day as TER ÷ 365 (TS §6.6). */
export const TER_DAYS_PER_YEAR = 365;

/**
 * Estimated spread costs of an execution (US-PF-07, TS §7.4): shares × the distance of the
 * execution price from the mid at that moment (ask − mid for a purchase, mid − bid for a sale),
 * rounded to cents like a market value. The bank's venue mark-up is part of the distance. 0 when
 * the price is not on the costly side of the mid.
 */
export function spreadCost(
  side: 'buy' | 'sell',
  quantity: MicroUnits,
  price: number,
  mid: number,
): Cents {
  const distance = side === 'buy' ? price - mid : mid - price;
  return marketValue(quantity, Math.max(distance, 0));
}

/**
 * Estimated TER costs of one calendar day (US-PF-07, TS §7.4) in unrounded cents: the end-of-day
 * value × TER ÷ 365, the share the market model takes from the ETF's price each day (§6.6).
 * Holding values are never negative.
 */
export function dailyTerCost(value: Cents, ter: number): number {
  return (value * ter) / TER_DAYS_PER_YEAR;
}
