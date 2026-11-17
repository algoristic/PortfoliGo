import { Directive } from '@angular/core';

/** Column header text of a table, on `<thead>` or on its header row. */
@Directive({
  selector: 'thead[appTableHead], tr[appTableHead]',
  host: { class: 'text-xs text-fg-muted' },
})
export class TableHeadDirective {}
