import { TransactionType } from '@app/banking/domain/models/ledger.model';
import { StatementPeriod } from '@app/banking/domain/models/statement.model';

/** Transaction types that occur in stage 1 up to M3 (TS §7.2); trading adds its own with M5. */
export const STATEMENT_FILTER_TYPES = [
  'opening-balance',
  'salary',
  'living-costs',
  'account-fee',
  'custody-fee',
  'transfer',
  'buy',
  'sell',
  'dividend',
  'fund-distribution',
  'credit-interest',
  'overdraft-interest',
  'debit-interest',
  'tax',
  'tax-refund',
] as const satisfies readonly TransactionType[];

export interface StatementPeriodOption {
  id: StatementPeriod;
  label: string;
}

export interface StatementTypeOption {
  /** `''`: all types. */
  id: TransactionType | '';
  label: string;
}
