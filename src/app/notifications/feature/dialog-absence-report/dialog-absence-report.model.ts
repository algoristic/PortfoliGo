import { AbsenceReport } from '@app/notifications/domain/models/absence-report.model';
import {
  AccountNames,
  InstrumentNames,
} from '@app/notifications/ui/labels/notification-text.utils';

export interface AbsenceReportDialogData {
  report: AbsenceReport;
  /** Names of the accounts for the texts of the warnings. */
  accountNames: AccountNames;
  /** Names of the instruments for the texts of order notifications. */
  instrumentNames: InstrumentNames;
}
