import { IndicatorKind, IndicatorSpec } from '@app/analysis/domain/models/indicator.model';
import { formatNumber } from '@app/shared/util/format';

/** Short names of the indicators (US-CH-02). */
export function indicatorKindLabel(kind: IndicatorKind): string {
  switch (kind) {
    case 'sma':
      return $localize`:@@uiMarket-indicatorLabels-sma:SMA`;
    case 'ema':
      return $localize`:@@uiMarket-indicatorLabels-ema:EMA`;
    case 'smma':
      return $localize`:@@uiMarket-indicatorLabels-smma:SMMA`;
    case 'bollinger':
      return $localize`:@@uiMarket-indicatorLabels-bollinger:Bollinger`;
  }
}

/** Name and parameters, e.g. `SMA 20` or `Bollinger 20/2,5`. */
export function indicatorLabel(spec: IndicatorSpec): string {
  const name = `${indicatorKindLabel(spec.kind)} ${spec.period}`;
  return spec.kind === 'bollinger'
    ? `${name}/${formatNumber(spec.multiplier, Number.isInteger(spec.multiplier) ? 0 : 1)}`
    : name;
}
