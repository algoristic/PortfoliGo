import { CostKind } from '@app/banking/domain/models/income-costs.model';

export interface IncomeCostsMonthView {
  id: string;
  label: string;
  dividends: string;
  creditInterest: string;
}

export interface IncomeCostsCostView {
  kind: CostKind;
  label: string;
  value: string;
  estimated: boolean;
}

export interface IncomeCostsYearView {
  year: number;
  running: boolean;
  months: IncomeCostsMonthView[];
  dividends: string;
  creditInterest: string;
  costs: IncomeCostsCostView[];
  totalCosts: string;
  estimatedCosts: string;
}
