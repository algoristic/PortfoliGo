/** Whole game minutes since the epoch 01.01.2020, 00:00 game time (TS §3.1, E-02). */
export type Tick = number;

export const MINUTES_PER_HOUR = 60;
export const HOURS_PER_DAY = 24;
export const MINUTES_PER_DAY = MINUTES_PER_HOUR * HOURS_PER_DAY;
export const DAYS_PER_WEEK = 7;

/**
 * Game code converts time via these constants instead of literal `60` or `1440`, so that the
 * tick length can change later (e.g. to seconds) without searching the code base.
 */
export const TICKS_PER_MINUTE = 1;
export const TICKS_PER_HOUR = TICKS_PER_MINUTE * MINUTES_PER_HOUR;
export const TICKS_PER_DAY = TICKS_PER_MINUTE * MINUTES_PER_DAY;
export const TICKS_PER_WEEK = TICKS_PER_DAY * DAYS_PER_WEEK;
export const GAME_SECONDS_PER_TICK = 60 / TICKS_PER_MINUTE;

/** ISO weekday order starting at 0: Monday = 0 … Sunday = 6. */
export const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6] as const;
export type Weekday = (typeof WEEKDAYS)[number];
export const SATURDAY: Weekday = 5;

export interface CalendarDate {
  year: number;
  /** 1–12. */
  month: number;
  /** 1–31. */
  day: number;
}

export interface TimeOfDay {
  /** 0–23. */
  hour: number;
  /** 0–59. */
  minute: number;
}

export type GameDateTime = CalendarDate & TimeOfDay;

/** Trading hours as minutes of the game day, `open < close` (TS §3.3, E-18). */
export interface TradingHours {
  open: number;
  close: number;
}
