import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { RouterModule } from '@angular/router';

import { IconDirective } from '@app/shared/ui/icon/icon.directive';

import { GlossaryComponent } from '../../ui/glossary/glossary.component';
import { HelpFacade } from '../state/help.facade';

@Component({
  selector: 'app-help-page',
  imports: [CommonModule, RouterModule, IconDirective, GlossaryComponent],
  templateUrl: './help.page.html',
  host: { class: 'block' },
})
export class HelpPage {
  helpFacade = inject(HelpFacade);
}
