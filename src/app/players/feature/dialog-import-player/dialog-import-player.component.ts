import { DialogRef } from '@angular/cdk/dialog';
import { Component, ElementRef, inject, PendingTasks, signal, viewChild } from '@angular/core';
import { form, FormField, FormRoot, validate } from '@angular/forms/signals';

import { ButtonDirective } from '@app/shared/ui/button/button.directive';
import { DialogComponent } from '@app/shared/ui/dialog/dialog.component';
import { IconDirective } from '@app/shared/ui/icon/icon.directive';

import { InputDirective } from '@app/shared/ui/input/input.directive';

import {
  ImportFile,
  ImportPlayerDialogResult,
  ImportPlayerFormModel,
} from './dialog-import-player.model';

/**
 * Takes an export as a file or as pasted text (US-EX-02, TS §10.3); a chosen file wins over the
 * text. Checking the content is the worker's job.
 */
@Component({
  selector: 'app-dialog-import-player',
  imports: [InputDirective, DialogComponent, ButtonDirective, IconDirective, FormField, FormRoot],
  templateUrl: './dialog-import-player.component.html',
  host: { class: 'block' },
})
export class DialogImportPlayerComponent {
  readonly #dialogRef = inject<DialogRef<ImportPlayerDialogResult>>(DialogRef);
  readonly #pendingTasks = inject(PendingTasks);

  fileInput = viewChild.required<ElementRef<HTMLInputElement>>('fileInput');

  file = signal<ImportFile | null>(null);
  fileUnreadable = signal(false);

  importPlayerModel = signal<ImportPlayerFormModel>({ text: '' });
  importPlayerForm = form(
    this.importPlayerModel,
    (path) => {
      validate(path.text, ({ value }) =>
        this.file() === null && value().trim() === ''
          ? {
              kind: 'required',
              message: $localize`:@@featurePlayers-dialogImportPlayer-required:Bitte wähle eine Datei oder füge den Spielstand als Text ein.`,
            }
          : null,
      );
    },
    {
      submission: {
        action: async (field) =>
          this.#dialogRef.close(this.file()?.content ?? field().value().text),
      },
    },
  );

  heading = $localize`:@@featurePlayers-dialogImportPlayer-heading:Spielstand importieren`;

  onSelectFile(event: Event): void {
    const chosen = (event.target as HTMLInputElement).files?.[0];
    this.fileUnreadable.set(false);
    if (chosen === undefined) {
      this.file.set(null);
      return;
    }
    void this.#pendingTasks.run(async () => {
      try {
        this.file.set({ name: chosen.name, content: await chosen.text() });
      } catch {
        this.file.set(null);
        this.fileUnreadable.set(true);
      }
    });
  }

  onChooseFile(): void {
    this.fileInput().nativeElement.click();
  }

  onRemoveFile(): void {
    this.file.set(null);
    this.fileInput().nativeElement.value = '';
  }

  decline(): void {
    this.#dialogRef.close();
  }
}
