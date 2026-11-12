import { ExchangeInfo } from '@app/engine/data-access/service/engine-service.model';

import { selectExchangeStatuses, selectRegionStatuses } from './clock.selectors';

const EPOCH_MS = Date.UTC(2020, 0, 1);
const MS_PER_MINUTE = 60_000;

function tick(year: number, month: number, day: number, hour = 0, minute = 0): number {
  return (Date.UTC(year, month - 1, day, hour, minute) - EPOCH_MS) / MS_PER_MINUTE;
}

// TS §3.3; the engine lists the exchanges in the order of the world.
const EXCHANGES: ExchangeInfo[] = [
  { id: 'us', name: 'US', regionId: 'north-america', open: 930, close: 1_320 },
  { id: 'de', name: 'DE', regionId: 'europe', open: 540, close: 1_050 },
  { id: 'in', name: 'IN', regionId: 'emerging-markets', open: 285, close: 660 },
  { id: 'jp', name: 'JP', regionId: 'asia-pacific', open: 60, close: 420 },
  { id: 'br', name: 'BR', regionId: 'emerging-markets', open: 840, close: 1_260 },
];

describe('clock selectors', () => {
  // Monday 01.04.2030, 10:00: Europe and India are open.
  const now = tick(2030, 4, 1, 10);

  describe('selectRegionStatuses', () => {
    it('gives the regions in display order and leaves out regions without exchanges', () => {
      expect(selectRegionStatuses.projector(EXCHANGES, now)).toEqual([
        { regionId: 'asia-pacific', status: { open: false, changesAt: tick(2030, 4, 2, 1) } },
        { regionId: 'europe', status: { open: true, changesAt: tick(2030, 4, 1, 17, 30) } },
        { regionId: 'north-america', status: { open: false, changesAt: tick(2030, 4, 1, 15, 30) } },
        { regionId: 'emerging-markets', status: { open: true, changesAt: tick(2030, 4, 1, 11) } },
      ]);
      expect(
        selectRegionStatuses
          .projector(
            EXCHANGES.filter(({ regionId }) => regionId === 'europe'),
            now,
          )
          .map(({ regionId }) => regionId),
      ).toEqual(['europe']);
    });

    it('is empty before the exchanges or the first clock event', () => {
      expect(selectRegionStatuses.projector(null, now)).toEqual([]);
      expect(selectRegionStatuses.projector(EXCHANGES, null)).toEqual([]);
    });
  });

  describe('selectExchangeStatuses', () => {
    it('groups the exchanges by region in display order and keeps their order within', () => {
      expect(selectExchangeStatuses.projector(EXCHANGES, now).map(({ id }) => id)).toEqual([
        'jp',
        'de',
        'us',
        'in',
        'br',
      ]);
      expect(selectExchangeStatuses.projector(EXCHANGES, now)[4]).toEqual({
        id: 'br',
        name: 'BR',
        regionId: 'emerging-markets',
        status: { open: false, changesAt: tick(2030, 4, 1, 14) },
      });
    });
  });
});
