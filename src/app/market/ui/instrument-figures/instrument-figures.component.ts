import { Component, computed, input } from '@angular/core';

import { FormatCompactEurosPipe } from '@app/shared/ui/pipes/format-compact-euros/format-compact-euros.pipe';
import { FormatNumberPipe } from '@app/shared/ui/pipes/format-number/format-number.pipe';
import { FormatPercentPipe } from '@app/shared/ui/pipes/format-percent/format-percent.pipe';
import { FormatSignedPercentPipe } from '@app/shared/ui/pipes/format-signed-percent/format-signed-percent.pipe';
import { StatTileComponent } from '@app/shared/ui/stat-tile/stat-tile.component';

import { InstrumentFiguresView } from '../models/instrument-view.model';

/**
 * Key figures of the instrument page (US-MK-03, TS §8.2): market capitalisation (ETFs: fund
 * volume), dividend yield, volatility, beta and performance over one month, one year and five
 * years; `–` where a figure doesn't apply. The definitions follow below the tiles.
 */
@Component({
  selector: 'app-instrument-figures',
  imports: [
    FormatCompactEurosPipe,
    FormatNumberPipe,
    FormatPercentPipe,
    FormatSignedPercentPipe,
    StatTileComponent,
  ],
  templateUrl: './instrument-figures.component.html',
  host: { class: 'block' },
})
export class InstrumentFiguresComponent {
  figures = input.required<InstrumentFiguresView>();

  sizeLabel = computed(() =>
    this.figures().kind === 'etf' ? this.fundVolumeLabel : this.marketCapLabel,
  );

  marketCapLabel = $localize`:@@uiMarket-instrumentFigures-marketCap:Marktkapitalisierung`;
  fundVolumeLabel = $localize`:@@uiMarket-instrumentFigures-fundVolume:Fondsvolumen`;
  dividendYieldLabel = $localize`:@@uiMarket-instrumentFigures-dividendYield:Dividendenrendite`;
  volatilityLabel = $localize`:@@uiMarket-instrumentFigures-volatility:Volatilität (1 Jahr)`;
  betaLabel = $localize`:@@uiMarket-instrumentFigures-beta:Beta (Weltindex)`;
  m1Label = $localize`:@@uiMarket-instrumentFigures-m1:Performance 1 Monat`;
  y1Label = $localize`:@@uiMarket-instrumentFigures-y1:Performance 1 Jahr`;
  y5Label = $localize`:@@uiMarket-instrumentFigures-y5:Performance 5 Jahre`;
}
