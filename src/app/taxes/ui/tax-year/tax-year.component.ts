import { Component, computed, input } from '@angular/core';

import { FormatCentsPipe } from '@app/shared/ui/pipes/format-cents/format-cents.pipe';
import { FormatPercentPipe } from '@app/shared/ui/pipes/format-percent/format-percent.pipe';
import { FormatSignedCentsPipe } from '@app/shared/ui/pipes/format-signed-cents/format-signed-cents.pipe';
import { TaxYearSummary } from '@app/taxes/domain/models/tax.model';
import { SAVER_ALLOWANCE } from '@app/taxes/domain/tax-logic';

/**
 * Figures of a tax year (US-ST-04): capital income by kind and in all, the loss carried in, the
 * saver's allowance used with a bar, the tax withheld, refunded and remaining, and the loss carried
 * into the next year. The running year is marked; its figures are those so far.
 */
@Component({
  selector: 'app-tax-year',
  imports: [FormatCentsPipe, FormatPercentPipe, FormatSignedCentsPipe],
  templateUrl: './tax-year.component.html',
  host: { class: 'block' },
})
export class TaxYearComponent {
  summary = input.required<TaxYearSummary>();
  current = input(false);

  allowance = SAVER_ALLOWANCE;

  allowanceRatio = computed(() => this.summary().usedAllowance / SAVER_ALLOWANCE);

  allowanceLabel = $localize`:@@uiTaxes-taxYear-allowanceLabel:Genutzter Sparerpauschbetrag`;
}
