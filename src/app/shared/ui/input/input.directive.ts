import { booleanAttribute, computed, Directive, input } from '@angular/core';

import { FIELD_BACKGROUND_CLASSES, FIELD_BASE_CLASSES } from './field-classes';
import { FieldBackground, FieldSize } from './input.model';

const SIZE_CLASSES: Record<FieldSize, string> = {
  sm: 'h-8 px-2',
  md: 'h-10 px-3',
  auto: 'px-3 py-2',
};

// A directive keeps the native element, so `[formField]`, labels and `data-testid` work as before.
@Directive({
  selector: 'input[appInput], textarea[appInput]',
  host: { '[class]': 'classes()' },
})
export class InputDirective {
  fieldSize = input<FieldSize>('md');
  background = input<FieldBackground>('surface');
  numeric = input(false, { transform: booleanAttribute });

  classes = computed(
    () =>
      `${FIELD_BASE_CLASSES} ${FIELD_BACKGROUND_CLASSES[this.background()]} ${SIZE_CLASSES[this.fieldSize()]}${this.numeric() ? ' tabular-nums' : ''}`,
  );
}
