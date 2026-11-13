import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { Component, inject } from '@angular/core';

import { AbsenceReportComponent } from '@app/notifications/ui/absence-report/absence-report.component';
import { ButtonDirective } from '@app/shared/ui/button/button.directive';
import { DialogComponent } from '@app/shared/ui/dialog/dialog.component';

import { AbsenceReportDialogData } from './dialog-absence-report.model';

/**
 * The absence report after a catch-up or a hidden period (US-BN-03). The focus starts on the dialog
 * itself, so that a screen reader reads it from the title; Escape, the close button and „Weiter“
 * close it (TS §11.10).
 */
@Component({
  selector: 'app-dialog-absence-report',
  imports: [DialogComponent, ButtonDirective, AbsenceReportComponent],
  templateUrl: './dialog-absence-report.component.html',
  host: { class: 'block' },
})
export class DialogAbsenceReportComponent {
  readonly #dialogRef = inject<DialogRef<void>>(DialogRef);
  data = inject<AbsenceReportDialogData>(DIALOG_DATA);

  heading = $localize`:@@featureNotifications-dialogAbsenceReport-heading:Während deiner Abwesenheit`;

  close(): void {
    this.#dialogRef.close();
  }
}
