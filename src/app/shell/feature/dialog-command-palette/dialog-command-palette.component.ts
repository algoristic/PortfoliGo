import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { Component, computed, DOCUMENT, inject, linkedSignal, signal } from '@angular/core';

import { IconDirective } from '@app/shared/ui/icon/icon.directive';
import { rankSearch } from '@app/shared/util/search-ranking';
import { nextActiveIndex } from '@app/shell/domain/command-palette-logic';

import {
  CommandPaletteDialogData,
  CommandPaletteDialogResult,
  CommandPaletteEntry,
} from './dialog-command-palette.model';

/** At most this many hits; the list stays short enough to read and to render on every key. */
const MAX_RESULTS = 30;
const LISTBOX_ID = 'command-palette-list';

/**
 * Command palette (PS US-UI-05, TS §11.4): a combobox with a list of hits after the ARIA pattern
 * „editable combobox with list autocomplete“. The focus stays in the field, the arrow keys move the
 * active option (`aria-activedescendant`), Enter runs it, Escape closes the dialog.
 */
@Component({
  selector: 'app-dialog-command-palette',
  imports: [IconDirective],
  templateUrl: './dialog-command-palette.component.html',
  host: { class: 'block' },
})
export class DialogCommandPaletteComponent {
  readonly #dialogRef = inject<DialogRef<CommandPaletteDialogResult>>(DialogRef);
  readonly #data = inject<CommandPaletteDialogData>(DIALOG_DATA);
  readonly #document = inject(DOCUMENT);

  listboxId = LISTBOX_ID;

  query = signal('');
  results = computed<CommandPaletteEntry[]>(() => {
    const query = this.query();
    const fieldsOf = (entry: CommandPaletteEntry): { label: string; keywords: string[] } => ({
      label: entry.label,
      keywords: entry.keywords,
    });
    if (query.trim() === '') {
      return this.#data.commands;
    }
    return rankSearch(
      [...this.#data.commands, ...this.#data.instruments],
      query,
      fieldsOf,
      MAX_RESULTS,
    );
  });
  /** The first hit is active after every change of the list. */
  activeIndex = linkedSignal<CommandPaletteEntry[], number>({
    source: this.results,
    computation: (results) => (results.length > 0 ? 0 : -1),
  });
  options = computed(() =>
    this.results().map((entry) => ({
      ...entry,
      optionId: optionId(entry.id),
      groupLabel: this.#groupLabels[entry.group],
    })),
  );
  activeOptionId = computed(() => this.options()[this.activeIndex()]?.optionId ?? null);
  resultText = computed(() => {
    const count = this.results().length;
    if (count === 0) {
      return $localize`:@@featureShell-dialogCommandPalette-noHits:Keine Treffer.`;
    }
    return count === 1
      ? $localize`:@@featureShell-dialogCommandPalette-oneHit:1 Treffer.`
      : $localize`:@@featureShell-dialogCommandPalette-hits:${count}:count: Treffer.`;
  });

  inputLabel = $localize`:@@featureShell-dialogCommandPalette-inputLabel:Seite, Aktion oder Wertpapier suchen`;
  closeLabel = $localize`:@@featureShell-dialogCommandPalette-close:Schließen`;
  readonly #groupLabels: Record<CommandPaletteEntry['group'], string> = {
    page: $localize`:@@featureShell-dialogCommandPalette-groupPage:Seite`,
    action: $localize`:@@featureShell-dialogCommandPalette-groupAction:Aktion`,
    instrument: $localize`:@@featureShell-dialogCommandPalette-groupInstrument:Wertpapier`,
  };

  onInput(event: Event): void {
    this.query.set((event.target as HTMLInputElement).value);
  }

  onKeydown(event: KeyboardEvent): void {
    switch (event.key) {
      case 'ArrowDown':
      case 'ArrowUp':
        event.preventDefault();
        this.activeIndex.set(nextActiveIndex(this.activeIndex(), event.key, this.results().length));
        this.#scrollActiveIntoView();
        break;
      case 'Enter': {
        event.preventDefault();
        const entry = this.results()[this.activeIndex()];
        if (entry !== undefined) {
          this.onSelect(entry);
        }
        break;
      }
    }
  }

  onSelect(entry: CommandPaletteEntry): void {
    this.#dialogRef.close(entry.command);
  }

  decline(): void {
    this.#dialogRef.close();
  }

  #scrollActiveIntoView(): void {
    const id = this.activeOptionId();
    // The option exists already: only the active index changed, not the list.
    if (id !== null) {
      this.#document.getElementById(id)?.scrollIntoView({ block: 'nearest' });
    }
  }
}

function optionId(id: string): string {
  return `${LISTBOX_ID}-${id}`;
}
