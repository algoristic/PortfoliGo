import { booleanAttribute, computed, Directive, inject, input } from '@angular/core';

import { TableDirective } from './table.directive';
import { TableCellAlign, TableDensity } from './table.model';

const DENSITY_CLASSES: Record<TableDensity, string> = {
  comfortable: 'px-3 py-2',
  compact: 'px-2 py-1',
  // Padding only vertically: the table sits flush in a panel, column gaps come from the caller.
  flush: 'py-1',
};

const ALIGN_CLASSES: Record<TableCellAlign, string> = {
  start: 'text-left',
  center: 'text-center',
  end: 'text-right',
};

/** Header or data cell; its padding follows the `density` of the enclosing `appTable`. */
@Directive({
  selector: 'th[appTableCell], td[appTableCell]',
  host: { '[class]': 'classes()' },
})
export class TableCellDirective {
  readonly #table = inject(TableDirective, { optional: true });

  align = input<TableCellAlign>();
  numeric = input(false, { transform: booleanAttribute });
  nowrap = input(false, { transform: booleanAttribute });

  classes = computed(() => {
    const align = this.align();
    const classes = [DENSITY_CLASSES[this.#table?.density() ?? 'comfortable']];
    if (align) {
      classes.push(ALIGN_CLASSES[align]);
    }
    if (this.nowrap()) {
      classes.push('whitespace-nowrap');
    }
    if (this.numeric()) {
      classes.push('tabular-nums');
    }
    return classes.join(' ');
  });
}
