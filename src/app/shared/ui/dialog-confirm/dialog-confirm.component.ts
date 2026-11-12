import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { Component, inject } from '@angular/core';

import { ConfirmDialogData, ConfirmDialogResult } from './dialog-confirm.model';

import { ButtonDirective } from '../button/button.directive';
import { DialogComponent } from '../dialog/dialog.component';

@Component({
  selector: 'app-dialog-confirm',
  imports: [DialogComponent, ButtonDirective],
  templateUrl: './dialog-confirm.component.html',
  host: { class: 'block' },
})
export class DialogConfirmComponent {
  readonly #dialogRef = inject<DialogRef<ConfirmDialogResult>>(DialogRef);
  data = inject<ConfirmDialogData>(DIALOG_DATA);

  confirmLabel = this.data.confirmLabel ?? $localize`:@@uiShared-dialogConfirm-confirm:Bestätigen`;
  declineLabel = this.data.declineLabel ?? $localize`:@@uiShared-dialogConfirm-decline:Abbrechen`;

  confirm(): void {
    this.#dialogRef.close(true);
  }

  decline(): void {
    this.#dialogRef.close(false);
  }
}
