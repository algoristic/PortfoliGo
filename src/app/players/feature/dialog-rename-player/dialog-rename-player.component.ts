import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { Component, inject, signal } from '@angular/core';
import { apply, form, FormField, FormRoot } from '@angular/forms/signals';

import { ButtonDirective } from '@app/shared/ui/button/button.directive';
import { DialogComponent } from '@app/shared/ui/dialog/dialog.component';

import {
  RenamePlayerDialogData,
  RenamePlayerDialogResult,
  RenamePlayerFormModel,
} from './dialog-rename-player.model';

import { playerNameSchema } from '../../ui/schemas/player-name-schema';

@Component({
  selector: 'app-dialog-rename-player',
  imports: [DialogComponent, ButtonDirective, FormField, FormRoot],
  templateUrl: './dialog-rename-player.component.html',
  host: { class: 'block' },
})
export class DialogRenamePlayerComponent {
  readonly #dialogRef = inject<DialogRef<RenamePlayerDialogResult>>(DialogRef);
  data = inject<RenamePlayerDialogData>(DIALOG_DATA);

  renamePlayerModel = signal<RenamePlayerFormModel>({ name: this.data.name });
  renamePlayerForm = form(
    this.renamePlayerModel,
    (path) => {
      apply(path.name, playerNameSchema);
    },
    {
      submission: {
        action: async (field) => this.#dialogRef.close(field().value().name),
      },
    },
  );

  heading = $localize`:@@featurePlayers-dialogRenamePlayer-heading:Spieler umbenennen`;

  decline(): void {
    this.#dialogRef.close();
  }
}
