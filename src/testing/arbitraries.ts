import fc from 'fast-check';

import {
  dateTimeToTick,
  dayIndex,
  dayStartTick,
  GAME_START_TICK,
} from '@app/clock/domain/calendar-logic';

// Shared fast-check arbitraries for domain properties (TS §14.1).

/** First tick of 2101; the calendar is defined from the epoch (2020) up to here. */
export const END_OF_CALENDAR_TICK = dateTimeToTick({ year: 2101, month: 1, day: 1 });

/** Any game minute between the epoch and the end of 2100. */
export const arbTick = (): fc.Arbitrary<number> =>
  fc.integer({ min: 0, max: END_OF_CALENDAR_TICK - 1 });

/** Any day index between the epoch and the end of 2100. */
export const arbDay = (): fc.Arbitrary<number> =>
  fc.integer({ min: 0, max: dayIndex(END_OF_CALENDAR_TICK) - 1 });

/** Any day of the prehistory (epoch up to the day before the game start). */
export const arbPrehistoryDay = (): fc.Arbitrary<number> =>
  fc.integer({ min: 0, max: dayIndex(GAME_START_TICK) - 1 });

/** Sorted, distinct split points strictly inside `(0, end)`. */
export const arbSplitPoints = (end: number, maxPoints = 8): fc.Arbitrary<number[]> =>
  fc
    .uniqueArray(fc.integer({ min: 1, max: Math.max(1, end - 1) }), { maxLength: maxPoints })
    .map((points) => points.filter((point) => point < end).sort((a, b) => a - b));

/** Seed strings as players type them, including whitespace, case and Unicode. */
export const arbSeedText = (): fc.Arbitrary<string> => fc.string({ minLength: 1, maxLength: 24 });

/** Start tick of a day, for properties over whole days. */
export const dayStart = (day: number): number => dayStartTick(day);
