import { Cents } from '@app/shared/domain/models/money.model';

/** Tax state of the current calendar year (TS §7.7, E-11). */
export interface TaxYear {
  year: number;
  /** Negative result carried over from the previous year (≤ 0). */
  lossCarryForward: Cents;
  /** Sum of the taxable income of the year so far: gains and losses, dividends, credit interest. */
  income: Cents;
  /** Tax withheld this year minus refunds; always the tax due on the result so far. */
  withheld: Cents;
}

export interface TaxAssessment {
  state: TaxYear;
  /** > 0: withhold (`tax`), < 0: refund (`tax-refund`), 0: nothing to book. */
  delta: Cents;
}
