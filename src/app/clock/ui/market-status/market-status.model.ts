import { ExchangeStatus } from '@app/clock/domain/models/exchange-status.model';
import { RegionId } from '@app/world/domain/models/taxonomy.model';

/** Order of the region displays in the header: by the start of trading in the game day. */
export const MARKET_STATUS_REGIONS = [
  'asia-pacific',
  'europe',
  'north-america',
  'emerging-markets',
] as const satisfies readonly RegionId[];

export interface RegionStatusEntry {
  regionId: RegionId;
  status: ExchangeStatus;
}

export interface ExchangeStatusEntry {
  id: string;
  name: string;
  regionId: RegionId;
  status: ExchangeStatus;
}
