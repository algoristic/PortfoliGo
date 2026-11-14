import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';

import { PanelComponent } from '@app/shared/ui/panel/panel.component';
import { FormatCentsPipe } from '@app/shared/ui/pipes/format-cents/format-cents.pipe';
import { FormatPercentPipe } from '@app/shared/ui/pipes/format-percent/format-percent.pipe';
import { SkeletonComponent } from '@app/shared/ui/skeleton/skeleton.component';
import { CAPITAL_INCOME_TAX_RATE, SAVER_ALLOWANCE } from '@app/taxes/domain/tax-logic';
import { TaxYearComponent } from '@app/taxes/ui/tax-year/tax-year.component';

import { TaxesFacade } from '../state/taxes.facade';

/**
 * Tax overview (US-ST-04, TS §7.7): every tax year with its capital income, the saver's allowance
 * used, the tax withheld and refunded and the loss carry-forward, the running year first and
 * marked; above it the rules of the game in short.
 */
@Component({
  selector: 'app-taxes-page',
  imports: [
    CommonModule,
    FormatCentsPipe,
    FormatPercentPipe,
    PanelComponent,
    SkeletonComponent,
    TaxYearComponent,
  ],
  templateUrl: './taxes.page.html',
  host: { class: 'block' },
})
export class TaxesPage {
  facade = inject(TaxesFacade);

  taxRate = CAPITAL_INCOME_TAX_RATE;
  allowance = SAVER_ALLOWANCE;

  rulesHeading = $localize`:@@featureTaxes-taxesPage-rulesHeading:So funktionieren Steuern im Spiel`;
}
