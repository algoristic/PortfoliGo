import { inject, Injectable } from '@angular/core';
import { filter, Observable, Subject, take } from 'rxjs';

import { LAB_WORKER_FACTORY } from './lab-simulation-service.config';
import {
  ComputedStatistics,
  GeneratedWorld,
  LabWorkerPort,
  LabWorkerRequest,
  LabWorkerRequestType,
  LabWorkerResponse,
  LabWorkerResults,
  LoadedCandles,
  SimulatedPeriod,
} from './lab-simulation-service.model';

import { Tick } from '../../../clock/domain/models/time.model';
import { CandleResolution } from '../../../market/domain/models/candle.model';
import { CandleSource } from '../../domain/models/candle-source.model';
import { StatisticsStart } from '../../domain/models/lab-statistics.model';

/**
 * Talks to the lab worker (precursor of the `EngineService`, AP 2.2): one request per call,
 * answered by the response with the same id. The worker starts with the first request.
 */
@Injectable()
export class LabSimulationService {
  readonly #createWorker = inject(LAB_WORKER_FACTORY);
  readonly #responses = new Subject<LabWorkerResponse>();
  #worker?: LabWorkerPort;
  #nextId = 1;

  generate(seed: string): Observable<GeneratedWorld> {
    return this.#request((id) => ({ id, type: 'generate', seed }));
  }

  simulate(days: number): Observable<SimulatedPeriod> {
    return this.#request((id) => ({ id, type: 'simulate', days }));
  }

  simulateYears(years: number): Observable<SimulatedPeriod> {
    return this.#request((id) => ({ id, type: 'simulate-years', years }));
  }

  statistics(start: StatisticsStart): Observable<ComputedStatistics> {
    return this.#request((id) => ({ id, type: 'statistics', start }));
  }

  candles(
    series: number,
    resolution: CandleResolution,
    fromTick: Tick,
    toTick: Tick,
    source: CandleSource,
  ): Observable<LoadedCandles> {
    return this.#request((id) => ({
      id,
      type: 'candles',
      series,
      resolution,
      fromTick,
      toTick,
      source,
    }));
  }

  /** Stops the worker and drops its world; the next request starts a new one. */
  terminate(): void {
    this.#worker?.terminate();
    this.#worker = undefined;
  }

  #request<K extends LabWorkerRequestType>(
    build: (id: number) => Extract<LabWorkerRequest, { type: K }>,
  ): Observable<LabWorkerResults[K]> {
    return new Observable((subscriber) => {
      const request = build(this.#nextId++);
      const subscription = this.#responses
        .pipe(
          filter((response) => response.id === request.id),
          take(1),
        )
        .subscribe((response) => {
          if (response.type === 'error') {
            subscriber.error(new Error(response.message));
            return;
          }
          // The worker answers a request with a response of the same type.
          subscriber.next(response.result as LabWorkerResults[K]);
          subscriber.complete();
        });
      this.#ensureWorker().postMessage(request);
      return subscription;
    });
  }

  #ensureWorker(): LabWorkerPort {
    if (this.#worker === undefined) {
      const worker = this.#createWorker();
      worker.addEventListener('message', ({ data }) => this.#responses.next(data));
      this.#worker = worker;
    }
    return this.#worker;
  }
}
