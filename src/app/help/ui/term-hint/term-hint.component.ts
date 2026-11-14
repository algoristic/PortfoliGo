import { Component, computed, inject, input } from '@angular/core';

import { GlossaryTermId } from '@app/help/domain/models/glossary.model';
import { HelpHintComponent } from '@app/shared/ui/help-hint/help-hint.component';

import { GLOSSARY_LINK } from './glossary-link.config';

import { glossaryText } from '../labels/glossary-texts';

/** Context help for a glossary term (PS US-UI-06): its short text and a link to its entry. */
@Component({
  selector: 'app-term-hint',
  imports: [HelpHintComponent],
  templateUrl: './term-hint.component.html',
  host: { class: 'inline-flex align-middle' },
})
export class TermHintComponent {
  glossaryLink = inject(GLOSSARY_LINK);

  termId = input.required<GlossaryTermId>();

  text = computed(() => glossaryText(this.termId()));
  testId = computed(() => `help.hint.${this.termId()}`);
}
