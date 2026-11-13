import { CdkVirtualScrollViewport, ScrollingModule } from '@angular/cdk/scrolling';
import { Component, computed, effect, input, output, untracked, viewChild } from '@angular/core';

import { StatementEntry } from '@app/banking/domain/models/statement.model';
import { SkeletonComponent } from '@app/shared/ui/skeleton/skeleton.component';
import { Bank } from '@app/world/domain/models/bank.model';

import { StatementListRange, StatementRow } from './statement-list.model';
import { statementRows } from './statement-list.utils';

/** Height of a row in px: `h-16` in the template, the item size of the virtual scrolling. */
const ROW_HEIGHT_PX = 64;

/**
 * Bookings of an account (US-BK-06) with virtual scrolling: only the rendered rows exist in the
 * DOM, rows outside the loaded window show as skeletons until their page arrives.
 */
@Component({
  selector: 'app-statement-list',
  imports: [ScrollingModule, SkeletonComponent],
  templateUrl: './statement-list.component.html',
  host: { class: 'block' },
})
export class StatementListComponent {
  total = input.required<number>();
  offset = input.required<number>();
  entries = input.required<StatementEntry[]>();
  banks = input<Bank[] | null>();
  /** The list scrolls to the top when this changes (a new filter). */
  resetKey = input<unknown>();

  rowHeight = ROW_HEIGHT_PX;

  changedRange = output<StatementListRange>();

  viewport = viewChild(CdkVirtualScrollViewport);

  #bankNames = computed(
    () => new Map((this.banks() ?? []).map((bank) => [bank.id, bank.name] as const)),
  );
  rows = computed(() =>
    statementRows(this.total(), this.offset(), this.entries(), this.#bankNames()),
  );

  label = $localize`:@@uiBanking-statementList-label:Buchungen`;

  #scrollToTop = effect(() => {
    this.resetKey();
    untracked(() => this.viewport()?.scrollToIndex(0));
  });

  trackRow(index: number, row: StatementRow): number {
    return row === null ? -1 - index : row.seq;
  }

  onScrolledIndex(first: number): void {
    const visible = Math.ceil((this.viewport()?.getViewportSize() ?? 0) / ROW_HEIGHT_PX);
    this.changedRange.emit({ start: first, end: Math.min(this.total(), first + visible) });
  }
}
