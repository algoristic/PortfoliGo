import { Component, computed, input } from '@angular/core';

import { PriceChangeMode } from './price-change.model';

import { ChangeDirection, changeDirection } from '../../util/change-direction';
import { formatSignedCents, formatSignedPercent } from '../../util/format';
import { IconDirective } from '../icon/icon.directive';

const PERCENT_DIGITS = 2;

const DIRECTION_CLASSES: Record<ChangeDirection, string> = {
  up: 'text-up',
  down: 'text-down',
  flat: 'text-fg-muted',
};

const DIRECTION_ICONS: Record<ChangeDirection, string> = {
  up: 'arrow-up-right',
  down: 'arrow-down-right',
  flat: 'arrow-right',
};

/** Change with sign, arrow and colour, so it is distinguishable without colour (US-UI-02). */
@Component({
  selector: 'app-price-change',
  imports: [IconDirective],
  templateUrl: './price-change.component.html',
  host: { class: 'inline-block' },
})
export class PriceChangeComponent {
  /** A ratio (`0.0129` = +1,29 %) in `percent` mode, an amount of cents in `cents` mode. */
  value = input.required<number>();
  mode = input<PriceChangeMode>('percent');
  showArrow = input(true);

  direction = computed(() =>
    this.mode() === 'percent'
      ? changeDirection(this.value() * 100, PERCENT_DIGITS)
      : changeDirection(this.value()),
  );
  text = computed(() =>
    this.mode() === 'percent'
      ? formatSignedPercent(this.value(), PERCENT_DIGITS)
      : formatSignedCents(this.value()),
  );
  colorClass = computed(() => DIRECTION_CLASSES[this.direction()]);
  icon = computed(() => DIRECTION_ICONS[this.direction()]);
}
