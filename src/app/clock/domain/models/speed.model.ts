import { Tick } from './time.model';

/** Speed levels, slowest first (TS §3.4). Pause is a separate flag, not a speed. */
export const SPEEDS = [
  { id: 'realtime', gameSecondsPerSecond: 1 },
  { id: '1min', gameSecondsPerSecond: 60 },
  { id: '10min', gameSecondsPerSecond: 600 },
  { id: '1h', gameSecondsPerSecond: 3_600 },
  { id: '2h', gameSecondsPerSecond: 7_200 },
  { id: '4h', gameSecondsPerSecond: 14_400 },
  { id: '1d', gameSecondsPerSecond: 86_400 },
  { id: '1w', gameSecondsPerSecond: 604_800 },
] as const;
export type Speed = (typeof SPEEDS)[number];
export type SpeedId = Speed['id'];

/** Wall-clock reference point from which the target tick is derived (TS §3.5). */
export interface ClockAnchor {
  tick: Tick;
  /** Wall-clock time in milliseconds since the Unix epoch. */
  realTimeMs: number;
}
