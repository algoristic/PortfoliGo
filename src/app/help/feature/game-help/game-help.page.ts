import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';

import { GlossaryComponent } from '../../ui/glossary/glossary.component';
import { HelpFacade } from '../state/help.facade';

/** The glossary inside the game area, so reading it doesn't close the game. */
@Component({
  selector: 'app-game-help-page',
  imports: [CommonModule, GlossaryComponent],
  templateUrl: './game-help.page.html',
  host: { class: 'block' },
})
export class GameHelpPage {
  helpFacade = inject(HelpFacade);
}
