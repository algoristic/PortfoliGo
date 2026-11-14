import {
  afterRenderEffect,
  Component,
  computed,
  ElementRef,
  inject,
  input,
  linkedSignal,
} from '@angular/core';
import { RouterModule } from '@angular/router';

import { GLOSSARY_TERMS } from '@app/help/domain/glossary';
import { GLOSSARY_TERM_IDS } from '@app/help/domain/models/glossary.model';
import { IconDirective } from '@app/shared/ui/icon/icon.directive';
import { searchScore } from '@app/shared/util/search-ranking';

import { GlossaryEntryView, GlossaryGroupView } from './glossary.model';

import { glossaryCategoryLabel, glossaryText } from '../labels/glossary-texts';

const ANCHOR_PREFIX = 'glossary-';

/**
 * The glossary (PS US-UI-06): terms grouped by topic with an anchor each, a search over term,
 * keywords and short text, and „Siehe auch“ links to other entries. The entry named by `termId`
 * (the URL fragment) scrolls into view and takes the focus.
 */
@Component({
  selector: 'app-glossary',
  imports: [RouterModule, IconDirective],
  templateUrl: './glossary.component.html',
  host: { class: 'block' },
})
export class GlossaryComponent {
  readonly #host = inject<ElementRef<HTMLElement>>(ElementRef);

  /** Term from the URL fragment; unknown values are ignored. */
  termId = input<string | null>();

  /** A new target clears the search, so the entry is never filtered out. */
  query = linkedSignal({ source: this.termId, computation: () => '' });
  targetId = computed(() => {
    const id = this.termId();
    return GLOSSARY_TERM_IDS.find((candidate) => candidate === id) ?? null;
  });
  #entries = computed(() =>
    GLOSSARY_TERMS.map((term) => {
      const text = glossaryText(term.id);
      return {
        term,
        text,
        view: {
          id: term.id,
          anchorId: ANCHOR_PREFIX + term.id,
          term: text.term,
          short: text.short,
          details: text.details,
          related: term.related.map((id) => ({ id, term: glossaryText(id).term })),
        } satisfies GlossaryEntryView,
      };
    }),
  );
  groups = computed<GlossaryGroupView[]>(() => {
    const query = this.query();
    const groups: GlossaryGroupView[] = [];
    for (const { term, text, view } of this.#entries()) {
      const fields = { label: text.term, keywords: [text.keywords, text.short] };
      if (searchScore(fields, query) === null) {
        continue;
      }
      const last = groups.at(-1);
      if (last?.category === term.category) {
        last.entries.push(view);
      } else {
        groups.push({
          category: term.category,
          label: glossaryCategoryLabel(term.category),
          entries: [view],
        });
      }
    }
    return groups;
  });
  hitCount = computed(() =>
    this.groups().reduce((count, group) => count + group.entries.length, 0),
  );
  resultText = computed(() => {
    const count = this.hitCount();
    if (this.query().trim() === '') {
      return '';
    }
    if (count === 0) {
      return $localize`:@@uiHelp-glossary-noHits:Kein Begriff gefunden.`;
    }
    return count === 1
      ? $localize`:@@uiHelp-glossary-oneHit:1 Begriff gefunden.`
      : $localize`:@@uiHelp-glossary-hits:${count}:count: Begriffe gefunden.`;
  });

  searchLabel = $localize`:@@uiHelp-glossary-searchLabel:Begriffe durchsuchen`;

  constructor() {
    afterRenderEffect(() => {
      const id = this.targetId();
      if (id === null) {
        return;
      }
      // The entry has a scroll margin for the sticky header of the game area.
      const entry = this.#host.nativeElement.querySelector<HTMLElement>(`#${ANCHOR_PREFIX}${id}`);
      const heading = entry?.querySelector('h3');
      entry?.scrollIntoView({ block: 'start' });
      heading?.focus({ preventScroll: true });
    });
  }

  onSearch(event: Event): void {
    this.query.set((event.target as HTMLInputElement).value);
  }
}
