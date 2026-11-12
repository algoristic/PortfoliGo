import { inject, Injectable } from '@angular/core';
import { filter, Observable, Subject, take } from 'rxjs';

import { Tick } from '@app/clock/domain/models/time.model';

import { CandleResolution } from '@app/market/domain/models/candle.model';

import { LAB_WORKER_FACTORY } from './lab-simulation-service.config';
import {
  ComputedChecksums,
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
  /** Ends the open requests: `null` when the worker was stopped, an error when it failed. */
  readonly #stops = new Subject<Error | null>();
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

  /** Golden-master checksums computed in the worker of this browser (self-test, TS §14.2). */
  goldenChecksums(): Observable<ComputedChecksums> {
    return this.#request((id) => ({ id, type: 'golden' }));
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

  /**
   * Stops the worker and drops its world; the next request starts a new one. Open requests
   * complete without a value, so that effects waiting for them accept new requests.
   */
  terminate(): void {
    this.#worker?.terminate();
    this.#worker = undefined;
    this.#stops.next(null);
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
      subscription.add(
        this.#stops
          .pipe(take(1))
          .subscribe((error) => (error === null ? subscriber.complete() : subscriber.error(error))),
      );
      this.#ensureWorker().postMessage(request);
      return subscription;
    });
  }

  #ensureWorker(): LabWorkerPort {
    if (this.#worker === undefined) {
      const worker = this.#createWorker();
      worker.addEventListener('message', ({ data }) => this.#responses.next(data));
      const fail = (event: Event): void => {
        if (this.#worker !== worker) {
          return;
        }
        worker.terminate();
        this.#worker = undefined;
        const detail = event instanceof ErrorEvent && event.message ? `: ${event.message}` : '';
        this.#stops.next(new Error(`LabSimulationService: the lab worker failed${detail}`));
      };
      worker.addEventListener('error', fail);
      worker.addEventListener('messageerror', fail);
      this.#worker = worker;
    }
    return this.#worker;
  }
}
