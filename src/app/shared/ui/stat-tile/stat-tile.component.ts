import { Component, computed, input } from '@angular/core';

import { MISSING_VALUE } from '../../util/format';
import { PriceChangeComponent } from '../price-change/price-change.component';
import { PriceChangeMode } from '../price-change/price-change.model';

/** Key figure: label, formatted value with an optional unit (not next to `–`) and change. */
@Component({
  selector: 'app-stat-tile',
  imports: [PriceChangeComponent],
  templateUrl: './stat-tile.component.html',
  host: { class: 'block' },
})
export class StatTileComponent {
  label = input.required<string>();
  value = input.required<string>();
  unit = input<string>();
  change = input<number>();
  changeMode = input<PriceChangeMode>('percent');

  showUnit = computed(() => this.unit() !== undefined && this.value() !== MISSING_VALUE);
}
