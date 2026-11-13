import fc from 'fast-check';

import {
  dateTimeToTick,
  dayIndex,
  minuteOfDay,
  tickToDateTime,
} from '@app/clock/domain/calendar-logic';
import { TICKS_PER_DAY, TICKS_PER_MINUTE, TradingHours } from '@app/clock/domain/models/time.model';
import { isTradingTime } from '@app/clock/domain/trading-hours-logic';

import { OrderValidity } from './models/order.model';
import {
  isOrderExpired,
  latestValidityDate,
  orderExpiry,
  validityError,
} from './order-validity-logic';

import { arbTick } from '../../../testing/arbitraries';

const EUROPE: TradingHours = { open: 9 * 60, close: 17 * 60 + 30 };
const NORTH_AMERICA: TradingHours = { open: 15 * 60 + 30, close: 22 * 60 };
const ASIA_PACIFIC: TradingHours = { open: 60, close: 7 * 60 };

function at(day: number, month: number, year: number, hour = 0, minute = 0): number {
  return dateTimeToTick({ year, month, day, hour, minute });
}

const MONDAY_10 = at(1, 4, 2030, 10);

describe('order-validity-logic', () => {
  describe('orderExpiry', () => {
    // TS §7.5, Umsetzung AP 5.1a: „bis Tagesende“ ends with the next close of the exchange
    it.each<[string, TradingHours, number, number]>([
      ['Europe, Mo 10:00 during the session', EUROPE, MONDAY_10, at(1, 4, 2030, 17, 30)],
      ['Europe, Mo 08:00 before the session', EUROPE, at(1, 4, 2030, 8), at(1, 4, 2030, 17, 30)],
      ['Europe, Mo 17:29 last minute', EUROPE, at(1, 4, 2030, 17, 29), at(1, 4, 2030, 17, 30)],
      ['Europe, Mo 17:30 at the close', EUROPE, at(1, 4, 2030, 17, 30), at(2, 4, 2030, 17, 30)],
      ['Europe, Mo 23:00', EUROPE, at(1, 4, 2030, 23), at(2, 4, 2030, 17, 30)],
      ['Europe, Fr 18:00', EUROPE, at(5, 4, 2030, 18), at(8, 4, 2030, 17, 30)],
      ['Europe, Sa 10:00', EUROPE, at(6, 4, 2030, 10), at(8, 4, 2030, 17, 30)],
      ['North America, Mo 23:00', NORTH_AMERICA, at(1, 4, 2030, 23), at(2, 4, 2030, 22)],
      ['Asia-Pacific, Mo 00:30', ASIA_PACIFIC, at(1, 4, 2030, 0, 30), at(1, 4, 2030, 7)],
      ['Asia-Pacific, Mo 23:00', ASIA_PACIFIC, at(1, 4, 2030, 23), at(2, 4, 2030, 7)],
    ])('ends a day order placed %s', (_case, hours, tick, expected) => {
      expect(orderExpiry({ kind: 'day' }, tick, hours)).toBe(expected);
    });

    // TS §7.5, Umsetzung AP 5.1a: „bis Datum“ ends at 24:00 of the date, „bis auf Widerruf“ after a year
    it.each<[string, OrderValidity, number, number]>([
      [
        'a date',
        { kind: 'date', date: { year: 2030, month: 5, day: 15 } },
        MONDAY_10,
        at(16, 5, 2030),
      ],
      [
        'today',
        { kind: 'date', date: { year: 2030, month: 4, day: 1 } },
        MONDAY_10,
        at(2, 4, 2030),
      ],
      [
        'a Saturday',
        { kind: 'date', date: { year: 2030, month: 4, day: 6 } },
        MONDAY_10,
        at(7, 4, 2030),
      ],
      ['gtc', { kind: 'gtc' }, MONDAY_10, at(2, 4, 2031)],
      ['gtc on 29 February', { kind: 'gtc' }, at(29, 2, 2032, 12), at(1, 3, 2033)],
    ])('ends an order valid until %s', (_case, validity, tick, expected) => {
      expect(orderExpiry(validity, tick, EUROPE)).toBe(expected);
    });

    it('ends a day order with the close of a session that starts after placing it, or at once', () => {
      fc.assert(
        fc.property(arbTick(), arbHours(), (tick, hours) => {
          const expiry = orderExpiry({ kind: 'day' }, tick, hours);
          const sessionStart = expiry - (hours.close - hours.open) * TICKS_PER_MINUTE;
          expect(expiry).toBeGreaterThan(tick);
          expect(minuteOfDay(expiry)).toBe(hours.close);
          expect(isTradingTime(hours, expiry - TICKS_PER_MINUTE)).toBe(true);
          if (isTradingTime(hours, tick)) {
            expect(dayIndex(expiry)).toBe(dayIndex(tick));
          } else {
            expect(sessionStart).toBeGreaterThan(tick);
          }
        }),
      );
    });

    it('keeps every accepted date within the expiry of a gtc order, one year and a day at most', () => {
      fc.assert(
        fc.property(arbTick(), fc.integer({ min: 0, max: 400 }), (tick, days) => {
          const date = dateOf(tick + days * TICKS_PER_DAY);
          const validity: OrderValidity = { kind: 'date', date };
          const gtc = orderExpiry({ kind: 'gtc' }, tick, EUROPE);
          expect(gtc - tick).toBeGreaterThan(365 * TICKS_PER_DAY);
          expect(gtc - tick).toBeLessThanOrEqual(367 * TICKS_PER_DAY);
          if (validityError(validity, tick) === null) {
            expect(orderExpiry(validity, tick, EUROPE)).toBeLessThanOrEqual(gtc);
          } else {
            expect(orderExpiry(validity, tick, EUROPE)).toBeGreaterThan(gtc);
          }
        }),
      );
    });
  });

  describe('validityError', () => {
    // TS §7.5, Umsetzung AP 5.1a: placed Mo 01.04.2030, 10:00
    it.each<[string, OrderValidity, string | null]>([
      ['day', { kind: 'day' }, null],
      ['gtc', { kind: 'gtc' }, null],
      ['today', { kind: 'date', date: { year: 2030, month: 4, day: 1 } }, null],
      ['yesterday', { kind: 'date', date: { year: 2030, month: 3, day: 31 } }, 'invalid-validity'],
      ['one year later', { kind: 'date', date: { year: 2031, month: 4, day: 1 } }, null],
      [
        'a year and a day',
        { kind: 'date', date: { year: 2031, month: 4, day: 2 } },
        'validity-too-long',
      ],
      [
        '31 February',
        { kind: 'date', date: { year: 2030, month: 2, day: 31 } },
        'invalid-validity',
      ],
      ['month 0', { kind: 'date', date: { year: 2030, month: 0, day: 1 } }, 'invalid-validity'],
      ['month 13', { kind: 'date', date: { year: 2030, month: 13, day: 1 } }, 'invalid-validity'],
      ['day 0', { kind: 'date', date: { year: 2030, month: 5, day: 0 } }, 'invalid-validity'],
      [
        'a fractional day',
        { kind: 'date', date: { year: 2030, month: 5, day: 1.5 } },
        'invalid-validity',
      ],
      [
        'a fractional month',
        { kind: 'date', date: { year: 2030, month: 4.5, day: 1 } },
        'invalid-validity',
      ],
      [
        'a fractional year',
        { kind: 'date', date: { year: 2030.5, month: 5, day: 1 } },
        'invalid-validity',
      ],
    ])('checks %s', (_case, validity, expected) => {
      expect(validityError(validity, MONDAY_10)).toBe(expected);
    });

    it('rejects yesterday at 00:00, the very tick it ended', () => {
      const date = { year: 2030, month: 3, day: 31 };
      expect(validityError({ kind: 'date', date }, at(1, 4, 2030))).toBe('invalid-validity');
    });

    it('accepts 28 February 2033 for an order placed on 29 February 2032, not 1 March', () => {
      const tick = at(29, 2, 2032, 12);
      expect(latestValidityDate(tick)).toEqual({ year: 2033, month: 2, day: 28 });
      expect(validityError({ kind: 'date', date: { year: 2033, month: 3, day: 1 } }, tick)).toBe(
        'validity-too-long',
      );
    });
  });

  describe('isOrderExpired', () => {
    it.each([
      [at(1, 4, 2030, 17, 29), false],
      [at(1, 4, 2030, 17, 30), true],
      [at(1, 4, 2030, 17, 31), true],
    ])('tells at %d whether an order until 17:30 expired: %s', (tick, expected) => {
      expect(isOrderExpired({ expiresAt: at(1, 4, 2030, 17, 30) }, tick)).toBe(expected);
    });
  });
});

function arbHours(): fc.Arbitrary<TradingHours> {
  return fc
    .tuple(fc.integer({ min: 0, max: 24 * 60 - 1 }), fc.integer({ min: 1, max: 24 * 60 - 1 }))
    .filter(([open, length]) => open + length < 24 * 60)
    .map(([open, length]) => ({ open, close: open + length }));
}

function dateOf(tick: number): { year: number; month: number; day: number } {
  const { year, month, day } = tickToDateTime(tick);
  return { year, month, day };
}
