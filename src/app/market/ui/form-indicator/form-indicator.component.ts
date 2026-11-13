import { Component, computed, input, linkedSignal, output } from '@angular/core';
import { form, FormField, FormRoot, validate } from '@angular/forms/signals';

import {
  BOLLINGER_MULTIPLIERS,
  DEFAULT_INDICATOR_SPECS,
  INDICATOR_PERIOD_MAX,
  INDICATOR_PERIOD_MIN,
  isBollingerMultiplier,
  isIndicatorPeriod,
} from '@app/analysis/domain/indicator-logic';
import {
  INDICATOR_KINDS,
  IndicatorKind,
  IndicatorSpec,
} from '@app/analysis/domain/models/indicator.model';
import { ButtonDirective } from '@app/shared/ui/button/button.directive';
import { FormatNumberPipe } from '@app/shared/ui/pipes/format-number/format-number.pipe';

import { IndicatorFormModel } from './form-indicator.model';

import { indicatorKindLabel } from '../labels/indicator-labels';

/**
 * Kind and parameters of a chart indicator (US-CH-02, TS §11.7): period `n` from 2 to 200, for
 * Bollinger bands the multiplier `k`. A new indicator chooses its kind and starts from the kind's
 * defaults; an existing one keeps its kind.
 */
@Component({
  selector: 'app-form-indicator',
  imports: [ButtonDirective, FormField, FormRoot, FormatNumberPipe],
  templateUrl: './form-indicator.component.html',
  host: { class: 'block' },
})
export class FormIndicatorComponent {
  /** The indicator to change, or the defaults of a new one. */
  spec = input.required<IndicatorSpec>();
  isNew = input(false);

  kinds = INDICATOR_KINDS;
  multipliers = BOLLINGER_MULTIPLIERS;

  submittedIndicator = output<IndicatorSpec>();
  clickedCancel = output<void>();

  kind = linkedSignal<IndicatorKind>(() => this.spec().kind);
  indicatorModel = linkedSignal<IndicatorFormModel>(() => {
    const kind = this.kind();
    const spec = this.spec();
    const base = spec.kind === kind ? spec : DEFAULT_INDICATOR_SPECS[kind];
    return {
      period: base.period,
      multiplier: String(base.kind === 'bollinger' ? base.multiplier : 2),
    };
  });
  indicatorForm = form(
    this.indicatorModel,
    (path) => {
      validate(path.period, ({ value }) =>
        isIndicatorPeriod(value())
          ? null
          : {
              kind: 'period',
              message: $localize`:@@uiMarket-formIndicator-periodInvalid:Bitte gib eine ganze Zahl von ${INDICATOR_PERIOD_MIN}:MIN: bis ${INDICATOR_PERIOD_MAX}:MAX: ein.`,
            },
      );
      validate(path.multiplier, ({ value }) =>
        this.kind() !== 'bollinger' || isBollingerMultiplier(Number(value()))
          ? null
          : {
              kind: 'multiplier',
              message: $localize`:@@uiMarket-formIndicator-multiplierInvalid:Bitte wähle einen Faktor.`,
            },
      );
    },
    {
      submission: {
        action: async (field) => {
          const { period, multiplier } = field().value();
          if (period !== null) {
            const kind = this.kind();
            this.submittedIndicator.emit(
              kind === 'bollinger'
                ? { kind, period, multiplier: Number(multiplier) }
                : { kind, period },
            );
          }
        },
      },
    },
  );

  isBollinger = computed(() => this.kind() === 'bollinger');

  kindLabels = Object.fromEntries(
    INDICATOR_KINDS.map((kind) => [kind, indicatorKindLabel(kind)]),
  ) as Record<IndicatorKind, string>;

  onSelectKind(value: string): void {
    const kind = INDICATOR_KINDS.find((known) => known === value);
    if (kind !== undefined) {
      this.kind.set(kind);
    }
  }
}
