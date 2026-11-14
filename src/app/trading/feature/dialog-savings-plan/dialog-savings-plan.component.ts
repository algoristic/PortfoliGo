import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { Component, computed, inject, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { form, FormField, FormRoot } from '@angular/forms/signals';
import { of, switchMap } from 'rxjs';

import { AmountInputComponent } from '@app/shared/ui/amount-input/amount-input.component';
import { ButtonDirective } from '@app/shared/ui/button/button.directive';
import { DialogComponent } from '@app/shared/ui/dialog/dialog.component';
import { FormatCentsPipe } from '@app/shared/ui/pipes/format-cents/format-cents.pipe';
import { FormatPricePipe } from '@app/shared/ui/pipes/format-price/format-price.pipe';
import { FormatQuantityPipe } from '@app/shared/ui/pipes/format-quantity/format-quantity.pipe';
import {
  SAVINGS_PLAN_FIRST_DAY,
  SAVINGS_PLAN_LAST_DAY,
  SavingsPlanPreview,
} from '@app/trading/domain/models/savings-plan.model';
import { venueQuote } from '@app/trading/domain/order-preview-logic';
import { savingsPlanPreview } from '@app/trading/domain/savings-plan-logic';
import { SavingsPlanFormModel } from '@app/trading/ui/models/savings-plan.model';
import { savingsPlanSchema, savingsPlanSpecOf } from '@app/trading/ui/schemas/savings-plan-schema';

import { SavingsPlanDialogData, SavingsPlanDialogResult } from './dialog-savings-plan.model';

import { TradingFacade } from '../state/trading.facade';

/**
 * Creates or changes a savings plan (US-HD-05, TS §7.8): depot, eligible instrument, amount and
 * execution day (1–28), with the costs and the shares at the current ask as a preview. When the
 * clearing account does not cover the amount now, a hint points to a standing order as inflow
 * (E-21). The engine checks the command again.
 */
@Component({
  selector: 'app-dialog-savings-plan',
  imports: [
    DialogComponent,
    ButtonDirective,
    FormField,
    FormRoot,
    AmountInputComponent,
    FormatCentsPipe,
    FormatPricePipe,
    FormatQuantityPipe,
  ],
  templateUrl: './dialog-savings-plan.component.html',
  host: { class: 'block' },
})
export class DialogSavingsPlanComponent {
  readonly #dialogRef = inject<DialogRef<SavingsPlanDialogResult>>(DialogRef);
  readonly #facade = inject(TradingFacade);
  data = inject<SavingsPlanDialogData>(DIALOG_DATA);

  dayOptions = Array.from({ length: SAVINGS_PLAN_LAST_DAY - SAVINGS_PLAN_FIRST_DAY + 1 }, (_, i) =>
    String(SAVINGS_PLAN_FIRST_DAY + i),
  );

  depots = toSignal(this.#facade.savingsPlanDepots$, { initialValue: [] });
  instruments = toSignal(this.#facade.savingsPlanInstruments$, { initialValue: [] });
  etfs = computed(() => this.instruments().filter(({ kind }) => kind === 'etf'));
  stocks = computed(() => this.instruments().filter(({ kind }) => kind !== 'etf'));

  savingsPlanModel = signal<SavingsPlanFormModel>({ ...this.data.initial });
  savingsPlanForm = form(
    this.savingsPlanModel,
    savingsPlanSchema({
      feeOf: (depotId) =>
        this.depots().find((depot) => depot.depotId === depotId)?.savingsPlanFee ?? null,
      fixedTarget: this.data.mode === 'change',
    }),
    {
      submission: {
        action: async (field) => {
          const spec = savingsPlanSpecOf(field().value());
          if (spec !== null) {
            this.#dialogRef.close(
              this.data.mode === 'create' ? spec : { amount: spec.amount, day: spec.day },
            );
          }
        },
      },
    },
  );

  #instrumentId = computed(() => this.savingsPlanModel().instrumentId);
  quote = toSignal(
    toObservable(this.#instrumentId).pipe(
      switchMap((id) => (id === '' ? of(null) : this.#facade.exchangeQuote$(id))),
    ),
    { initialValue: null },
  );
  #depot = computed(
    () => this.depots().find(({ depotId }) => depotId === this.savingsPlanModel().depotId) ?? null,
  );
  /** Ask with the bank's mark-up, as the execution would see it now; `null` without a quote. */
  ask = computed(() => {
    const quote = this.quote();
    const depot = this.#depot();
    return quote === null || depot === null ? null : venueQuote(quote, depot.spreadMarkup).ask;
  });
  preview = computed((): SavingsPlanPreview | null => {
    const depot = this.#depot();
    const amount = this.savingsPlanModel().amount;
    return depot === null || amount === null || amount <= 0
      ? null
      : savingsPlanPreview(
          amount,
          this.ask(),
          depot.savingsPlanFee,
          depot.clearingBalance,
          depot.reserved,
        );
  });

  heading =
    this.data.mode === 'create'
      ? $localize`:@@featureTrading-dialogSavingsPlan-createHeading:Sparplan anlegen`
      : $localize`:@@featureTrading-dialogSavingsPlan-changeHeading:Sparplan ändern`;
  submitLabel =
    this.data.mode === 'create'
      ? $localize`:@@featureTrading-dialogSavingsPlan-create:Anlegen`
      : $localize`:@@featureTrading-dialogSavingsPlan-save:Speichern`;

  onSelectInstrument(): void {
    const instrumentId = this.savingsPlanModel().instrumentId;
    if (instrumentId !== '') {
      this.#facade.selectSavingsPlanInstrument(instrumentId);
    }
  }

  decline(): void {
    this.#dialogRef.close();
  }
}
