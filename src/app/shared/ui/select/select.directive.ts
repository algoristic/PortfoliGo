import { booleanAttribute, computed, Directive, input } from '@angular/core';

import { FIELD_BACKGROUND_CLASSES, FIELD_BASE_CLASSES } from '../input/field-classes';
import { FieldBackground, FieldSize } from '../input/input.model';

const SIZE_CLASSES: Record<FieldSize, string> = {
  sm: 'h-8 px-2',
  md: 'h-10 px-2',
  auto: 'px-2 py-1.5',
};

/** Native `<select>` with the field look of `appInput`. */
@Directive({
  selector: 'select[appSelect]',
  host: { '[class]': 'classes()' },
})
export class SelectDirective {
  fieldSize = input<FieldSize>('md');
  background = input<FieldBackground>('surface');
  numeric = input(false, { transform: booleanAttribute });

  classes = computed(
    () =>
      `${FIELD_BASE_CLASSES} ${FIELD_BACKGROUND_CLASSES[this.background()]} ${SIZE_CLASSES[this.fieldSize()]}${this.numeric() ? ' tabular-nums' : ''}`,
  );
}
