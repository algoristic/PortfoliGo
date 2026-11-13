import { NotificationSeverity } from '@app/notifications/domain/models/notification.model';

export const ABSENCE_REPORT_FLOWS = [
  'income',
  'credit-interest',
  'dividends',
  'living-costs',
  'fees',
  'debit-interest',
  'taxes',
] as const;
export type AbsenceReportFlowId = (typeof ABSENCE_REPORT_FLOWS)[number];

/** A line of income or expenses: earnings count up, expenses are amounts (US-EK-03). */
export interface AbsenceReportFlowView {
  id: AbsenceReportFlowId;
  label: string;
  amount: number;
}

export interface AbsenceReportFlowGroupView {
  id: 'income' | 'expenses';
  label: string;
  flows: AbsenceReportFlowView[];
}

export interface AbsenceReportWarningView {
  seq: number;
  tick: number;
  severity: NotificationSeverity;
  severityLabel: string;
  title: string;
  text: string;
}

export interface AbsenceReportIndexView {
  id: string;
  name: string;
  start: number;
  end: number;
  /** `(end − start) / start`; `null` without a start level. */
  change: number | null;
}
