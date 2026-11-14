import { CdkCopyToClipboard } from '@angular/cdk/clipboard';
import { Component, input, output } from '@angular/core';

import { ButtonDirective } from '@app/shared/ui/button/button.directive';
import { IconDirective } from '@app/shared/ui/icon/icon.directive';

/**
 * Name and seed of the player (PS US-UI-09, US-SP-03): renaming opens the dialog of the players
 * slice, the seed is copied in the click itself (CDK clipboard), so the browser allows it.
 */
@Component({
  selector: 'app-player-profile',
  imports: [CdkCopyToClipboard, ButtonDirective, IconDirective],
  templateUrl: './player-profile.component.html',
  host: { class: 'block' },
})
export class PlayerProfileComponent {
  /** `null` until the game is entered. */
  name = input<string | null>();
  seed = input<string | null>();

  clickedRename = output<void>();
  /** `false` when the browser refused to copy. */
  copiedSeed = output<boolean>();

  onRename(): void {
    this.clickedRename.emit();
  }

  onCopied(copied: boolean): void {
    this.copiedSeed.emit(copied);
  }
}
