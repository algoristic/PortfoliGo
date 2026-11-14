import { Clipboard } from '@angular/cdk/clipboard';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { Component, inject, signal } from '@angular/core';

import { FILE_DOWNLOAD } from '@app/shared/data-access/file-download/file-download';
import { ButtonDirective } from '@app/shared/ui/button/button.directive';
import { DialogComponent } from '@app/shared/ui/dialog/dialog.component';
import { IconDirective } from '@app/shared/ui/icon/icon.directive';

import {
  EXPORT_FILE_TYPE,
  ExportPlayerDialogData,
  ExportPlayerDialogResult,
} from './dialog-export-player.model';

/**
 * Offers the finished export as a download and for the clipboard (US-EX-01, TS §10.2). Both run in
 * the click itself: browsers copy only during a user action, and the export arrived before.
 */
@Component({
  selector: 'app-dialog-export-player',
  imports: [DialogComponent, ButtonDirective, IconDirective],
  templateUrl: './dialog-export-player.component.html',
  host: { class: 'block' },
})
export class DialogExportPlayerComponent {
  readonly #dialogRef = inject<DialogRef<ExportPlayerDialogResult>>(DialogRef);
  readonly #clipboard = inject(Clipboard);
  readonly #download = inject(FILE_DOWNLOAD);
  data = inject<ExportPlayerDialogData>(DIALOG_DATA);

  copyFailed = signal(false);

  heading = $localize`:@@featurePlayers-dialogExportPlayer-heading:Spielstand exportieren`;

  download(): void {
    this.#download.save(this.data.fileName, this.data.content, EXPORT_FILE_TYPE);
    this.#dialogRef.close('file');
  }

  copy(): void {
    if (this.#clipboard.copy(this.data.content)) {
      this.#dialogRef.close('clipboard');
    } else {
      this.copyFailed.set(true);
    }
  }

  close(): void {
    this.#dialogRef.close();
  }
}
