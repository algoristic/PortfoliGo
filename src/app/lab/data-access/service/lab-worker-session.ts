import { computeGoldenChecksums, GOLDEN_SEED } from '@app/market/domain/golden-master';

import { LabWorkerRequest, LabWorkerResponse } from './lab-simulation-service.model';

import { LabSimulation } from '../../domain/lab-simulation';

/**
 * Message handling of the lab worker, framework-free so that tests run it without a worker.
 * `clock` returns milliseconds (`performance.now` in the worker); it only measures durations.
 */
export class LabWorkerSession {
  readonly #clock: () => number;
  #simulation?: LabSimulation;

  constructor(clock: () => number) {
    this.#clock = clock;
  }

  handle(request: LabWorkerRequest): LabWorkerResponse {
    try {
      return this.#handle(request);
    } catch (error) {
      return {
        id: request.id,
        type: 'error',
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }

  #handle(request: LabWorkerRequest): LabWorkerResponse {
    switch (request.type) {
      case 'generate': {
        const start = this.#clock();
        const simulation = new LabSimulation(request.seed);
        const worldDone = this.#clock();
        simulation.runPrehistory();
        const prehistoryDone = this.#clock();
        this.#simulation = simulation;
        return {
          id: request.id,
          type: 'generate',
          result: {
            seed: simulation.seed,
            overview: simulation.overview(),
            now: simulation.now,
            worldMs: worldDone - start,
            prehistoryMs: prehistoryDone - worldDone,
          },
        };
      }
      case 'simulate': {
        const start = this.#clock();
        const step = this.#requireSimulation().simulate(request.days);
        return {
          id: request.id,
          type: 'simulate',
          result: { ...step, durationMs: this.#clock() - start },
        };
      }
      case 'simulate-years': {
        const start = this.#clock();
        const step = this.#requireSimulation().simulateYears(request.years);
        return {
          id: request.id,
          type: 'simulate-years',
          result: { ...step, durationMs: this.#clock() - start },
        };
      }
      case 'statistics': {
        const start = this.#clock();
        const statistics = this.#requireSimulation().statistics(request.start);
        return {
          id: request.id,
          type: 'statistics',
          result: { statistics, durationMs: this.#clock() - start },
        };
      }
      case 'golden': {
        // Needs no world: the self-test generates the golden world itself.
        const start = this.#clock();
        const checksums = computeGoldenChecksums(GOLDEN_SEED);
        return {
          id: request.id,
          type: 'golden',
          result: { checksums, durationMs: this.#clock() - start },
        };
      }
      case 'candles': {
        const start = this.#clock();
        const { series, resolution, fromTick, toTick, source } = request;
        const candles = this.#requireSimulation().candles(
          series,
          resolution,
          fromTick,
          toTick,
          source,
        );
        return {
          id: request.id,
          type: 'candles',
          result: { series, resolution, candles, durationMs: this.#clock() - start },
        };
      }
    }
  }

  #requireSimulation(): LabSimulation {
    if (this.#simulation === undefined) {
      throw new Error('LabWorkerSession: generate a world first');
    }
    return this.#simulation;
  }
}
