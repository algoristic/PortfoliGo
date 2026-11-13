import { Cents, MicroUnits } from '@app/shared/domain/models/money.model';
import { marketValue } from '@app/shared/domain/money-logic';

/** What valuing a holding needs: its instrument and shares. */
export interface Holding {
  instrumentId: string;
  quantity: MicroUnits;
}

/**
 * Value of holdings (TS §7.9): per holding shares × bid without the venue mark-up of a bank,
 * rounded to cents (`marketValue`), then summed. `bidOf` gives the bid of an instrument at the
 * valuation time; on days without trading that is the bid around the last price.
 */
export function holdingsValue(
  holdings: Iterable<Holding>,
  bidOf: (instrumentId: string) => number,
): Cents {
  let sum = 0;
  for (const { instrumentId, quantity } of holdings) {
    sum += marketValue(quantity, bidOf(instrumentId));
  }
  return sum;
}
