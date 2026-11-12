import fc from 'fast-check';

import { exchangeStatus, regionStatus } from './exchange-status-logic';
import { ExchangeStatus } from './models/exchange-status.model';
import { TICKS_PER_DAY, TradingHours } from './models/time.model';

import { arbTick } from '../../../testing/arbitraries';

const EPOCH_MS = Date.UTC(2020, 0, 1);
const MS_PER_MINUTE = 60_000;

/** Tick of a game date and time, independent of the calendar functions (`Date.UTC`). */
function tick(year: number, month: number, day: number, hour = 0, minute = 0): number {
  return (Date.UTC(year, month - 1, day, hour, minute) - EPOCH_MS) / MS_PER_MINUTE;
}

/** Independent oracle: open on a UTC weekday from the opening minute to the minute before closing. */
function isOpen(hours: TradingHours, at: number): boolean {
  const utcDay = new Date(EPOCH_MS + at * MS_PER_MINUTE).getUTCDay();
  const minute = ((at % TICKS_PER_DAY) + TICKS_PER_DAY) % TICKS_PER_DAY;
  return utcDay !== 0 && utcDay !== 6 && minute >= hours.open && minute < hours.close;
}

// TS §3.3: trading hours in game time.
const ASIA_PACIFIC: TradingHours[] = [{ open: 60, close: 420 }]; // 01:00–07:00
const EUROPE: TradingHours[] = [{ open: 540, close: 1_050 }]; // 09:00–17:30
const NORTH_AMERICA: TradingHours[] = [{ open: 930, close: 1_320 }]; // 15:30–22:00
const INDIA: TradingHours = { open: 285, close: 660 }; // 04:45–11:00
const BRAZIL: TradingHours = { open: 840, close: 1_260 }; // 14:00–21:00
const EMERGING_MARKETS = [INDIA, BRAZIL];

const open = (changesAt: number): ExchangeStatus => ({ open: true, changesAt });
const closed = (changesAt: number): ExchangeStatus => ({ open: false, changesAt });

describe('exchange-status-logic', () => {
  describe('exchangeStatus', () => {
    // TS §3.3: India 04:45–11:00; 01.04.2030 is a Monday, 05.04.2030 a Friday.
    it.each([
      ['Mo 04:44', tick(2030, 4, 1, 4, 44), closed(tick(2030, 4, 1, 4, 45))],
      ['Mo 04:45', tick(2030, 4, 1, 4, 45), open(tick(2030, 4, 1, 11))],
      ['Mo 10:59', tick(2030, 4, 1, 10, 59), open(tick(2030, 4, 1, 11))],
      ['Mo 11:00', tick(2030, 4, 1, 11), closed(tick(2030, 4, 2, 4, 45))],
      ['Fr 11:00', tick(2030, 4, 5, 11), closed(tick(2030, 4, 8, 4, 45))],
      ['Sa 06:00', tick(2030, 4, 6, 6), closed(tick(2030, 4, 8, 4, 45))],
    ])('gives the status of India at %s', (_label, now, expected) => {
      expect(exchangeStatus(INDIA, now)).toEqual(expected);
    });
  });

  describe('regionStatus', () => {
    // TS §3.3: the four region displays of the header; emerging markets are open while India or
    // Brazil is.
    it.each([
      [
        'Mo 01.04.2030, 00:00 (game start)',
        tick(2030, 4, 1),
        [
          closed(tick(2030, 4, 1, 1)),
          closed(tick(2030, 4, 1, 9)),
          closed(tick(2030, 4, 1, 15, 30)),
          closed(tick(2030, 4, 1, 4, 45)),
        ],
      ],
      [
        'Mo 09:00',
        tick(2030, 4, 1, 9),
        [
          closed(tick(2030, 4, 2, 1)),
          open(tick(2030, 4, 1, 17, 30)),
          closed(tick(2030, 4, 1, 15, 30)),
          open(tick(2030, 4, 1, 11)),
        ],
      ],
      [
        'Mo 11:00',
        tick(2030, 4, 1, 11),
        [
          closed(tick(2030, 4, 2, 1)),
          open(tick(2030, 4, 1, 17, 30)),
          closed(tick(2030, 4, 1, 15, 30)),
          closed(tick(2030, 4, 1, 14)),
        ],
      ],
      [
        'Mo 16:00',
        tick(2030, 4, 1, 16),
        [
          closed(tick(2030, 4, 2, 1)),
          open(tick(2030, 4, 1, 17, 30)),
          open(tick(2030, 4, 1, 22)),
          open(tick(2030, 4, 1, 21)),
        ],
      ],
      [
        'Fr 05.04.2030, 22:00',
        tick(2030, 4, 5, 22),
        [
          closed(tick(2030, 4, 8, 1)),
          closed(tick(2030, 4, 8, 9)),
          closed(tick(2030, 4, 8, 15, 30)),
          closed(tick(2030, 4, 8, 4, 45)),
        ],
      ],
      [
        'Sa 06.04.2030, 10:00',
        tick(2030, 4, 6, 10),
        [
          closed(tick(2030, 4, 8, 1)),
          closed(tick(2030, 4, 8, 9)),
          closed(tick(2030, 4, 8, 15, 30)),
          closed(tick(2030, 4, 8, 4, 45)),
        ],
      ],
    ])('gives the region statuses at %s', (_label, now, expected) => {
      expect(
        [ASIA_PACIFIC, EUROPE, NORTH_AMERICA, EMERGING_MARKETS].map((sessions) =>
          regionStatus(sessions, now),
        ),
      ).toEqual(expected);
    });

    it('stays open across overlapping sessions until the last one closes', () => {
      // TS §3.3: 09:00–12:00 and 11:00–14:00 make one open period up to 14:00.
      const sessions: TradingHours[] = [
        { open: 540, close: 720 },
        { open: 660, close: 840 },
      ];
      expect(regionStatus(sessions, tick(2030, 4, 1, 10))).toEqual(open(tick(2030, 4, 1, 14)));
    });

    it('is null without exchanges', () => {
      expect(regionStatus([], tick(2030, 4, 1))).toBeNull();
    });

    it('stays the same up to the change and changes there', () => {
      const arbHours = fc
        .integer({ min: 0, max: TICKS_PER_DAY - 2 })
        .chain((openMinute) =>
          fc
            .integer({ min: openMinute + 1, max: TICKS_PER_DAY - 1 })
            .map((close): TradingHours => ({ open: openMinute, close })),
        );
      fc.assert(
        fc.property(
          fc.array(arbHours, { minLength: 1, maxLength: 3 }),
          arbTick(),
          (sessions, now) => {
            const isRegionOpen = (at: number): boolean =>
              sessions.some((hours) => isOpen(hours, at));
            const status = regionStatus(sessions, now);
            expect(status?.open).toBe(isRegionOpen(now));
            const changesAt = status?.changesAt ?? now;
            expect(changesAt).toBeGreaterThan(now);
            for (let at = now; at < changesAt; at++) {
              expect(isRegionOpen(at)).toBe(status?.open);
            }
            expect(isRegionOpen(changesAt)).toBe(!status?.open);
          },
        ),
        { numRuns: 50 },
      );
    });
  });
});
