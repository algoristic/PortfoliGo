import { Cents } from '@app/shared/domain/models/money.model';

/**
 * Kinds of taxable capital income (TS §7.7): credit interest, dividends and fund distributions,
 * realized gains and losses of sales. They share one loss pool (E-11); the kind only splits the
 * yearly figures for the tax overview (US-ST-04).
 */
export const TAXABLE_INCOME_KINDS = ['interest', 'distribution', 'sale'] as const;
export type TaxableIncomeKind = (typeof TAXABLE_INCOME_KINDS)[number];

/** Tax state of a calendar year (TS §7.7, E-11); closed years keep it unchanged (US-ST-04). */
export interface TaxYear {
  year: number;
  /** Negative result carried over from the previous year (≤ 0). */
  lossCarryForward: Cents;
  /** Sum of the taxable income of the year so far: gains and losses, dividends, credit interest. */
  income: Cents;
  /** Tax withheld this year minus refunds; always the tax due on the result so far. */
  withheld: Cents;
  /** Credit interest of the year (part of `income`). */
  interest: Cents;
  /** Dividends and fund distributions of the year (part of `income`). */
  distributions: Cents;
  /** Realized gains of the year's sales, each sale ≥ 0 (part of `income`). */
  gains: Cents;
  /** Realized losses of the year's sales, each sale < 0 (part of `income`, ≤ 0). */
  losses: Cents;
  /** Sum of the withholdings (`tax`) of the year. */
  paid: Cents;
  /** Sum of the refunds (`tax-refund`) of the year, as a positive amount. */
  refunded: Cents;
}

export interface TaxAssessment {
  state: TaxYear;
  /** > 0: withhold (`tax`), < 0: refund (`tax-refund`), 0: nothing to book. */
  delta: Cents;
}

/**
 * Figures of a tax year for the tax overview (US-ST-04): the capital income by kind, the saver's
 * allowance used, the tax paid and refunded and the loss carry-forward into and out of the year.
 * For the running year they are the figures so far.
 */
export interface TaxYearSummary {
  year: number;
  interest: Cents;
  distributions: Cents;
  gains: Cents;
  losses: Cents;
  /** Sum of the four kinds. */
  income: Cents;
  /** Loss carried over from the previous year (≤ 0). */
  lossCarryForwardIn: Cents;
  /** Part of the saver's allowance that the year's result uses (0 to `SAVER_ALLOWANCE`). */
  usedAllowance: Cents;
  paid: Cents;
  refunded: Cents;
  /** Tax of the year after refunds: `paid − refunded`. */
  withheld: Cents;
  /** Loss carried into the next year (≤ 0); for the running year as if it ended now. */
  lossCarryForwardOut: Cents;
}

/** The tax effect of a sale before it is placed (US-HD-02, TS §7.7), without changing anything. */
export interface SaleTaxPreview {
  /** Acquisition cost of the shares sold by FIFO (TS §7.6). */
  costBasis: Cents;
  /** Proceeds after costs minus `costBasis`; losses negative. */
  realizedGain: Cents;
  /** Tax the sale would withhold, a refund negative. */
  tax: Cents;
  /** Proceeds after costs and taxes: what the clearing account would receive in all. */
  net: Cents;
}
