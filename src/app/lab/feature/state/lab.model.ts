import { Tick } from '@app/clock/domain/models/time.model';
import { CandleResolution } from '@app/market/domain/models/candle.model';

import { CandleSource } from '../../domain/models/candle-source.model';

export interface CandleRequest {
  series: number;
  resolution: CandleResolution;
  fromTick: Tick;
  toTick: Tick;
  source: CandleSource;
}

export const LAB_STATUSES = ['idle', 'generating', 'simulating', 'ready'] as const;
export type LabStatus = (typeof LAB_STATUSES)[number];

export interface LabTimings {
  worldMs: number;
  prehistoryMs: number;
  /** Duration of the last simulation run. */
  simulationMs?: number;
  /** Market days per second of the last simulation run. */
  marketDaysPerSecond?: number;
  candlesMs?: number;
  /** Duration of the last statistics computation. */
  statisticsMs?: number;
}
