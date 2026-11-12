import { Component, input, output } from '@angular/core';

import { IconDirective } from '../icon/icon.directive';

/**
 * Frame for dialog content opened with the CDK `Dialog`: title, content, `[dialogActions]` and a
 * close button. Focus trap, Escape and focus return come from the CDK dialog. Open dialogs with
 * `ariaLabel` (or `ariaLabelledBy`) so the dialog has an accessible name.
 */
@Component({
  selector: 'app-dialog',
  imports: [IconDirective],
  templateUrl: './dialog.component.html',
  host: { class: 'block' },
})
export class DialogComponent {
  heading = input.required<string>();
  testId = input('dialog');

  clickedClose = output<void>();

  closeLabel = $localize`:@@uiShared-dialog-close:Schließen`;

  onClose(): void {
    this.clickedClose.emit();
  }
}
