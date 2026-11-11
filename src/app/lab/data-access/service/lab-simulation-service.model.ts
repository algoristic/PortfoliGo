import { Tick } from '../../../clock/domain/models/time.model';
import { Candle, CandleResolution } from '../../../market/domain/models/candle.model';
import { CandleSource } from '../../domain/models/candle-source.model';
import { LabStatistics, StatisticsStart } from '../../domain/models/lab-statistics.model';
import { WorldOverview } from '../../domain/models/world-overview.model';

/** Messages of the lab worker (precursor of the engine protocol, TS §8.2). */
export type LabWorkerRequest =
  | { id: number; type: 'generate'; seed: string }
  | { id: number; type: 'simulate'; days: number }
  | { id: number; type: 'simulate-years'; years: number }
  | { id: number; type: 'statistics'; start: StatisticsStart }
  | {
      id: number;
      type: 'candles';
      series: number;
      resolution: CandleResolution;
      fromTick: Tick;
      toTick: Tick;
      source: CandleSource;
    };

export type LabWorkerRequestType = LabWorkerRequest['type'];

export interface GeneratedWorld {
  /** Normalized seed. */
  seed: string;
  overview: WorldOverview;
  now: Tick;
  worldMs: number;
  prehistoryMs: number;
}

export interface SimulatedPeriod {
  days: number;
  marketDays: number;
  now: Tick;
  durationMs: number;
}

export interface LoadedCandles {
  series: number;
  resolution: CandleResolution;
  candles: Candle[];
  durationMs: number;
}

export interface ComputedStatistics {
  statistics: LabStatistics;
  durationMs: number;
}

export interface LabWorkerResults {
  generate: GeneratedWorld;
  simulate: SimulatedPeriod;
  'simulate-years': SimulatedPeriod;
  candles: LoadedCandles;
  statistics: ComputedStatistics;
}

export type LabWorkerResponse =
  | {
      [K in LabWorkerRequestType]: { id: number; type: K; result: LabWorkerResults[K] };
    }[LabWorkerRequestType]
  | { id: number; type: 'error'; message: string };

/** The part of `Worker` the service uses; tests pass a fake. */
export interface LabWorkerPort {
  postMessage(message: LabWorkerRequest): void;
  addEventListener(
    type: 'message',
    listener: (event: MessageEvent<LabWorkerResponse>) => void,
  ): void;
  terminate(): void;
}
