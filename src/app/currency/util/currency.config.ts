import { EnvironmentProviders, InjectionToken, Provider } from '@angular/core';
import { MaskitoOptions } from '@maskito/core';
import { maskitoNumber, MaskitoNumberParams } from '@maskito/kit';

export type CurrencyConfig = MaskitoNumberParams;
export const CURRENCY_CONFIG = new InjectionToken<CurrencyConfig>('CURRENCY_CONFIG', {
  factory: () => ({
    decimalSeparator: ',',
    thousandSeparator: '.',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    postfix: ' €',
  }),
});
export const CURRENCY = new InjectionToken<Required<MaskitoOptions>>('CURRENCY');
export function provideCurrency(): Array<Provider | EnvironmentProviders> {
  return [
    {
      provide: CURRENCY,
      deps: [CURRENCY_CONFIG],
      useFactory: (config: CurrencyConfig) => maskitoNumber(config),
    },
  ];
}
