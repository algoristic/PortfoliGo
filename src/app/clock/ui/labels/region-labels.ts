import { formatGameWeekdayTime } from '@app/clock/domain/game-time-format';
import { ExchangeStatus } from '@app/clock/domain/models/exchange-status.model';
import { RegionId } from '@app/world/domain/models/taxonomy.model';

// Names of the regions and their trading status (PS US-ZT-01, TS §3.3), shared by the market status
// of the header and the markets page. The IDs keep the names of the header, where they began.

export interface RegionLabels {
  label: string;
  short: string;
}

/** Status of a region, e.g. `offen bis Mo., 17:30` or `öffnet Di., 09:00`. */
export function regionStatusText({ open, changesAt }: ExchangeStatus): string {
  const time = formatGameWeekdayTime(changesAt);
  return open
    ? $localize`:@@uiClock-marketStatus-openUntil:offen bis ${time}:time:`
    : $localize`:@@uiClock-marketStatus-opensAt:öffnet ${time}:time:`;
}

export function exchangeChangeText({ open, changesAt }: ExchangeStatus): string {
  const time = formatGameWeekdayTime(changesAt);
  return open
    ? $localize`:@@uiClock-marketStatus-closesAt:schließt ${time}:time:`
    : $localize`:@@uiClock-marketStatus-opensAtExchange:öffnet ${time}:time:`;
}

/** Full and short name of a region. */
export function regionLabels(regionId: RegionId): RegionLabels {
  switch (regionId) {
    case 'asia-pacific':
      return {
        label: $localize`:@@uiClock-marketStatus-asiaPacific:Asien-Pazifik`,
        short: $localize`:@@uiClock-marketStatus-asiaPacificShort:AP`,
      };
    case 'europe':
      return {
        label: $localize`:@@uiClock-marketStatus-europe:Europa`,
        short: $localize`:@@uiClock-marketStatus-europeShort:EU`,
      };
    case 'north-america':
      return {
        label: $localize`:@@uiClock-marketStatus-northAmerica:Nordamerika`,
        short: $localize`:@@uiClock-marketStatus-northAmericaShort:NA`,
      };
    case 'emerging-markets':
      return {
        label: $localize`:@@uiClock-marketStatus-emergingMarkets:Schwellenländer`,
        short: $localize`:@@uiClock-marketStatus-emergingMarketsShort:SL`,
      };
  }
}
