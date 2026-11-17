import { Directive, input } from '@angular/core';

import { TableDensity } from './table.model';

/** Data table; `density` sets the padding of its `appTableCell`s. */
@Directive({
  selector: 'table[appTable]',
  host: { class: 'w-full text-sm' },
})
export class TableDirective {
  density = input<TableDensity>('comfortable');
}
