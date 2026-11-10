import { Dialog } from '@angular/cdk/dialog';
import { map, Observable } from 'rxjs';

import { DialogConfirmComponent } from './dialog-confirm.component';
import { ConfirmDialogData, ConfirmDialogResult } from './dialog-confirm.model';

/** Opens the confirm dialog; for effects: `openConfirmDialog(…).pipe(filter(Boolean), map(…))`. */
export function openConfirmDialog(
  dialog: Pick<Dialog, 'open'>,
  data: ConfirmDialogData,
): Observable<boolean> {
  return dialog
    .open<ConfirmDialogResult, ConfirmDialogData>(DialogConfirmComponent, {
      data,
      ariaLabel: data.heading,
      role: 'alertdialog',
      width: '28rem',
      maxWidth: 'calc(100vw - 2rem)',
      maxHeight: 'calc(100dvh - 2rem)',
    })
    .closed.pipe(map((result) => result === true));
}
