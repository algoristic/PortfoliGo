import { IndexVariant } from '@app/market/domain/models/instrument.model';
import { EtfDistributionFrequency, EtfReplication } from '@app/world/domain/models/etf.model';
import { RiskClass } from '@app/world/domain/models/taxonomy.model';

// Names of the codes the instrument page shows (US-MK-03, TS §5.5, §5.6, §8.6).

/** Volatility class 1 (low) to 5 (high), e.g. `3 von 5`. */
export function riskClassLabel(riskClass: RiskClass): string {
  return $localize`:@@uiMarket-instrumentLabels-riskClass:${riskClass}:riskClass: von 5`;
}

export function indexVariantLabel(variant: IndexVariant): string {
  switch (variant) {
    case 'price':
      return $localize`:@@uiMarket-instrumentLabels-variantPrice:Kursindex`;
    case 'total-return':
      return $localize`:@@uiMarket-instrumentLabels-variantTotalReturn:Performanceindex (Dividenden reinvestiert)`;
  }
}

/** Use of income of an ETF with the frequency of its distributions. */
export function etfDistributionLabel(
  distribution: 'accumulating' | 'distributing',
  frequency: EtfDistributionFrequency | null,
): string {
  if (distribution === 'accumulating') {
    return $localize`:@@uiMarket-instrumentLabels-accumulating:Thesaurierend`;
  }
  switch (frequency) {
    case 'quarterly':
      return $localize`:@@uiMarket-instrumentLabels-distributingQuarterly:Ausschüttend, vierteljährlich`;
    case 'annual':
      return $localize`:@@uiMarket-instrumentLabels-distributingAnnual:Ausschüttend, jährlich`;
    default:
      return $localize`:@@uiMarket-instrumentLabels-distributing:Ausschüttend`;
  }
}

export function etfReplicationLabel(replication: EtfReplication): string {
  switch (replication) {
    case 'physical-full':
      return $localize`:@@uiMarket-instrumentLabels-replicationFull:Physisch, vollständig`;
    case 'physical-sampling':
      return $localize`:@@uiMarket-instrumentLabels-replicationSampling:Physisch, optimiert (Sampling)`;
    case 'synthetic':
      return $localize`:@@uiMarket-instrumentLabels-replicationSynthetic:Synthetisch (Swap)`;
  }
}
