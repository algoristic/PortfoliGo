import { AbsenceReport } from '@app/notifications/domain/models/absence-report.model';
import { AccountNames } from '@app/notifications/ui/labels/notification-text.utils';

export interface AbsenceReportDialogData {
  report: AbsenceReport;
  /** Names of the accounts for the texts of the warnings. */
  accountNames: AccountNames;
}
