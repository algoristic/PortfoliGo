import { Component, input } from '@angular/core';

import { PriceChangeComponent } from '../price-change/price-change.component';
import { PriceChangeMode } from '../price-change/price-change.model';

/** Key figure: label, formatted value and an optional change. */
@Component({
  selector: 'app-stat-tile',
  imports: [PriceChangeComponent],
  templateUrl: './stat-tile.component.html',
  styleUrl: './stat-tile.component.scss',
})
export class StatTileComponent {
  label = input.required<string>();
  value = input.required<string>();
  change = input<number>();
  changeMode = input<PriceChangeMode>('percent');
}
