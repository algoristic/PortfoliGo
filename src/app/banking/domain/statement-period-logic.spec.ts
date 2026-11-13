import { StatementPeriod, StatementPeriodRange } from './models/statement.model';
import { statementPeriodRange } from './statement-period-logic';

const MS_PER_MINUTE = 60_000;

/** Tick of a game time given in UTC (TS §3.2: game minutes since 01.01.2020, 00:00). */
function tickAt(year: number, month: number, day: number, hour = 0, minute = 0): number {
  return (Date.UTC(year, month - 1, day, hour, minute) - Date.UTC(2020, 0, 1)) / MS_PER_MINUTE;
}

describe('statementPeriodRange', () => {
  // TS §7.2, statement: periods at Wed., 15.05.2030, 10:00 and at Fri., 10.01.2031, 08:30
  it.each<[StatementPeriod, number, StatementPeriodRange]>([
    ['all', tickAt(2030, 5, 15, 10), {}],
    ['this-month', tickAt(2030, 5, 15, 10), { from: tickAt(2030, 5, 1) }],
    [
      'last-month',
      tickAt(2030, 5, 15, 10),
      { from: tickAt(2030, 4, 1), to: tickAt(2030, 4, 30, 23, 59) },
    ],
    ['this-year', tickAt(2030, 5, 15, 10), { from: tickAt(2030, 1, 1) }],
    [
      'last-year',
      tickAt(2030, 5, 15, 10),
      { from: tickAt(2029, 1, 1), to: tickAt(2029, 12, 31, 23, 59) },
    ],
    [
      'last-month',
      tickAt(2031, 1, 10, 8, 30),
      { from: tickAt(2030, 12, 1), to: tickAt(2030, 12, 31, 23, 59) },
    ],
    [
      'last-month',
      tickAt(2032, 3, 1),
      { from: tickAt(2032, 2, 1), to: tickAt(2032, 2, 29, 23, 59) },
    ],
    ['this-month', tickAt(2030, 5, 1), { from: tickAt(2030, 5, 1) }],
  ])('bounds %s at tick %d', (period, now, expected) => {
    expect(statementPeriodRange(period, now)).toEqual(expected);
  });
});
