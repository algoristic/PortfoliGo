import { TestBed } from '@angular/core/testing';
import { firstValueFrom, lastValueFrom } from 'rxjs';

import { LAB_WORKER_FACTORY } from './lab-simulation-service.config';
import {
  LabWorkerPort,
  LabWorkerRequest,
  LabWorkerResponse,
  SimulatedPeriod,
} from './lab-simulation-service.model';
import { LabSimulationService } from './lab-simulation.service';

class FakeWorker implements LabWorkerPort {
  readonly requests: LabWorkerRequest[] = [];
  terminated = false;
  #listener?: (event: MessageEvent<LabWorkerResponse>) => void;
  #errorListeners: Array<(event: Event) => void> = [];

  postMessage(message: LabWorkerRequest): void {
    this.requests.push(message);
  }

  addEventListener(
    type: 'message' | 'error' | 'messageerror',
    listener: (event: MessageEvent<LabWorkerResponse>) => void,
  ): void {
    if (type === 'message') {
      this.#listener = listener;
    } else {
      this.#errorListeners.push(listener as (event: Event) => void);
    }
  }

  terminate(): void {
    this.terminated = true;
  }

  respond(response: LabWorkerResponse): void {
    this.#listener?.({ data: response } as MessageEvent<LabWorkerResponse>);
  }

  fail(message: string): void {
    this.#errorListeners.forEach((listener) => listener(new ErrorEvent('error', { message })));
  }
}

describe('LabSimulationService', () => {
  let service: LabSimulationService;
  let workers: FakeWorker[];
  const period: SimulatedPeriod = { days: 7, marketDays: 5, now: 100, durationMs: 3 };

  beforeEach(() => {
    workers = [];
    TestBed.configureTestingModule({
      providers: [
        LabSimulationService,
        {
          provide: LAB_WORKER_FACTORY,
          useValue: () => {
            const worker = new FakeWorker();
            workers.push(worker);
            return worker;
          },
        },
      ],
    });
    service = TestBed.inject(LabSimulationService);
  });

  describe('simulate', () => {
    it('starts the worker lazily and posts the request', () => {
      const simulated = service.simulate(7);
      expect(workers).toHaveLength(0);
      simulated.subscribe();
      expect(workers).toHaveLength(1);
      expect(workers[0].requests).toEqual([{ id: 1, type: 'simulate', days: 7 }]);
    });

    it('emits the result of the response with the same id', async () => {
      const first = firstValueFrom(service.simulate(7));
      const second = firstValueFrom(service.simulate(14));
      workers[0].respond({ id: 2, type: 'simulate', result: { ...period, days: 14 } });
      workers[0].respond({ id: 1, type: 'simulate', result: period });
      expect(await first).toEqual(period);
      expect(await second).toEqual({ ...period, days: 14 });
    });

    it('errors when the worker answers with an error', async () => {
      const result = firstValueFrom(service.simulate(7));
      workers[0].respond({ id: 1, type: 'error', message: 'generate a world first' });
      await expect(result).rejects.toThrow('generate a world first');
    });
  });

  describe('candles', () => {
    it('posts the candle request', () => {
      service.candles(3, '1h', 10, 20, 'minutes').subscribe();
      expect(workers[0].requests).toEqual([
        {
          id: 1,
          type: 'candles',
          series: 3,
          resolution: '1h',
          fromTick: 10,
          toTick: 20,
          source: 'minutes',
        },
      ]);
    });
  });

  describe('simulateYears', () => {
    it('posts the request', () => {
      service.simulateYears(10).subscribe();
      expect(workers[0].requests).toEqual([{ id: 1, type: 'simulate-years', years: 10 }]);
    });
  });

  describe('statistics', () => {
    it('posts the request', () => {
      service.statistics('epoch').subscribe();
      expect(workers[0].requests).toEqual([{ id: 1, type: 'statistics', start: 'epoch' }]);
    });
  });

  describe('terminate', () => {
    it('stops the worker and starts a new one with the next request', () => {
      service.generate('a').subscribe();
      service.terminate();
      expect(workers[0].terminated).toBe(true);
      service.generate('b').subscribe();
      expect(workers).toHaveLength(2);
      expect(workers[1].requests).toEqual([{ id: 2, type: 'generate', seed: 'b' }]);
    });

    it('completes open requests without a value', async () => {
      const result = lastValueFrom(service.simulate(7), { defaultValue: 'none' });
      service.terminate();
      expect(await result).toBe('none');
    });
  });

  describe('worker errors', () => {
    it('errors open requests and starts a new worker with the next request', async () => {
      const result = firstValueFrom(service.simulate(7));
      workers[0].fail('chunk not found');
      await expect(result).rejects.toThrow('the lab worker failed: chunk not found');
      expect(workers[0].terminated).toBe(true);
      service.simulate(7).subscribe();
      expect(workers).toHaveLength(2);
    });

    it('ignores errors of a worker it no longer uses', async () => {
      service.simulate(7).subscribe();
      service.terminate();
      const result = firstValueFrom(service.simulate(14));
      workers[0].fail('late');
      workers[1].respond({ id: 2, type: 'simulate', result: period });
      expect(await result).toEqual(period);
    });
  });
});
