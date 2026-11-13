import fc from 'fast-check';

import { FeeModel } from '@app/banking/domain/models/bank-conditions.model';
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

/** Amounts in cents far beyond any game balance, still exact (TS §7.1). */
export const arbCents = (max = 1e12): fc.Arbitrary<number> => fc.integer({ min: -max, max });

/** Rates such as fees and interest (`0.025` = 2.5 %), including zero. */
export const arbRate = (max = 0.25): fc.Arbitrary<number> =>
  fc.double({ min: 0, max, noNaN: true, noDefaultInfinity: true });

const arbFeeBounds = (): fc.Arbitrary<{ min?: number; max?: number }> =>
  fc.record(
    { min: fc.integer({ min: 0, max: 10_000 }), max: fc.integer({ min: 0, max: 100_000 }) },
    { requiredKeys: [] },
  );

const arbFlatFeeModel = (): fc.Arbitrary<FeeModel> =>
  fc.oneof(
    fc.constant<FeeModel>({ kind: 'free' }),
    fc.record({ kind: fc.constant('flat' as const), amount: fc.integer({ min: 0, max: 10_000 }) }),
    fc
      .tuple(arbRate(0.05), arbFeeBounds())
      .map(([rate, bounds]): FeeModel => ({ kind: 'percent', rate, ...bounds })),
    fc
      .tuple(fc.integer({ min: 0, max: 10_000 }), arbRate(0.05), arbFeeBounds())
      .map(([amount, rate, bounds]): FeeModel => ({
        kind: 'flat-plus-percent',
        amount,
        rate,
        ...bounds,
      })),
  );

/** Any fee model of TS §7.3; tiers have ascending bounds and may end without a `null` tier. */
export const arbFeeModel = (): fc.Arbitrary<FeeModel> =>
  fc.oneof(
    arbFlatFeeModel(),
    fc
      .tuple(
        fc.uniqueArray(fc.integer({ min: 0, max: 10_000_000 }), { minLength: 1, maxLength: 4 }),
        fc.array(arbFlatFeeModel(), { minLength: 5, maxLength: 5 }),
        fc.boolean(),
      )
      .map(([bounds, fees, open]): FeeModel => {
        const sorted = [...bounds].sort((a, b) => a - b);
        const tiers: { upToVolume: number | null; fee: FeeModel }[] = sorted.map(
          (upToVolume, i) => ({ upToVolume, fee: fees[i] }),
        );
        return {
          kind: 'tiered',
          tiers: open ? [...tiers, { upToVolume: null, fee: fees[4] }] : tiers,
        };
      }),
  );

/** Any calendar month of the calendar (2020–2100). */
export const arbCalendarMonth = (): fc.Arbitrary<{ year: number; month: number }> =>
  fc.record({ year: fc.integer({ min: 2020, max: 2100 }), month: fc.integer({ min: 1, max: 12 }) });
