import { Component, computed, input } from '@angular/core';

import { sparklineGeometry } from '@app/charts/util/sparkline-geometry';
import { ChangeDirection } from '@app/shared/util/change-direction';

const DIRECTION_CLASSES: Record<ChangeDirection, string> = {
  up: 'text-up',
  down: 'text-down',
  flat: 'text-fg-muted',
};

/**
 * Sparkline as SVG (E-04): the values as a line, optionally with a reference line (e.g. the
 * previous close); coloured by the direction of the last value against the reference. It fills
 * the size the caller gives the host (e.g. `class="h-8 w-24"`). Without `label` it is decorative.
 */
@Component({
  selector: 'app-sparkline',
  imports: [],
  templateUrl: './sparkline.component.html',
  host: { class: 'inline-block' },
})
export class SparklineComponent {
  values = input.required<readonly number[]>();
  reference = input<number | null>(null);
  /** Accessible name; without it the sparkline is hidden from assistive technology. */
  label = input<string>();
  /** View box; the line keeps its stroke width when the host scales it. */
  width = input(100);
  height = input(32);

  geometry = computed(() =>
    sparklineGeometry(this.values(), this.reference(), this.width(), this.height()),
  );
  colorClass = computed(() => DIRECTION_CLASSES[this.geometry().direction]);
}
