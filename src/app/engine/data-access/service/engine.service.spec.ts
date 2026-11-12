import { TestBed } from '@angular/core/testing';
import { firstValueFrom, Subscription } from 'rxjs';

import { TestMarket, TestPrice } from '@app/engine/domain/testing/test-market';

import { EngineCommandMessage, ProgressPayload } from './engine-service.model';
import { EngineCommandError, EngineFatal, EngineService } from './engine.service';

import {
  InProcessEngine,
  InProcessEngineOptions,
  provideInProcessEngineWorker,
} from '../testing/in-process-engine-worker';

const EPOCH_MS = Date.UTC(2020, 0, 1);
const GAME_START = (Date.UTC(2030, 3, 1) - EPOCH_MS) / 60_000;
const PLAYER = {
  playerId: 'p1',
  seed: 'mini-1',
  start: { startCapital: 1_000_000, netIncome: 280_000, livingCosts: 170_000 },
};

function market(): TestMarket {
  const prices: TestPrice[][] = [];
  prices[0] = [{ tick: 0, price: 100 }];
  prices[1] = [{ tick: 0, price: 50 }];
  return new TestMarket(prices);
}

describe('EngineService', () => {
  let engine: InProcessEngine;
  let service: EngineService;

  function setup(options: InProcessEngineOptions = {}): void {
    engine = new InProcessEngine({ prices: () => market(), ...options });
    TestBed.configureTestingModule({
      providers: [EngineService, provideInProcessEngineWorker(engine)],
    });
    service = TestBed.inject(EngineService);
  }

  function received(type: EngineCommandMessage['type'], worker = engine.workers.length - 1) {
    return engine.workers[worker].received.filter((message) => message.type === type);
  }

  describe('commands', () => {
    beforeEach(() => setup());

    it('starts the worker with the first command and emits the data of its reply', async () => {
      expect(engine.workers).toHaveLength(0);
      expect(await firstValueFrom(service.loadPlayer(PLAYER))).toEqual({
        playerId: 'p1',
        tick: GAME_START,
      });
      expect(engine.workers).toHaveLength(1);
    });

    it('correlates concurrent commands with their replies', async () => {
      await firstValueFrom(service.loadPlayer(PLAYER));
      const [query, jump] = await Promise.all([
        firstValueFrom(service.query({ kind: 'exchanges' })),
        firstValueFrom(service.jumpTo({ kind: 'date', tick: GAME_START + 90 })),
      ]);
      expect(query.kind).toBe('exchanges');
      expect(query.exchanges.length).toBeGreaterThan(0);
      expect(jump).toEqual({ targetTick: GAME_START + 90 });
    });

    it('errors with the code of an error reply', async () => {
      const error = await firstValueFrom(service.setSpeed('1h')).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(EngineCommandError);
      expect((error as EngineCommandError).code).toBe('player-not-loaded');
    });

    it('ignores the reply of a command whose subscriber left, while the command still runs', async () => {
      await firstValueFrom(service.loadPlayer(PLAYER));
      const clocks: boolean[] = [];
      const clock = service.clock$.subscribe(({ paused }) => clocks.push(paused));
      const replies: unknown[] = [];
      service
        .resume()
        .subscribe({ next: (data) => replies.push(data), error: (e) => replies.push(e) })
        .unsubscribe();
      await engine.advance(200);
      expect(replies).toEqual([]);
      expect(clocks).toEqual([false]);
      clock.unsubscribe();
    });

    it('streams the clock of the running game', async () => {
      await firstValueFrom(service.loadPlayer(PLAYER));
      await firstValueFrom(service.setSpeed('1h'));
      const ticks: number[] = [];
      const clock = service.clock$.subscribe(({ tick }) => ticks.push(tick));
      await firstValueFrom(service.resume());
      await engine.advance(1_000);
      clock.unsubscribe();
      expect(ticks.length).toBeGreaterThan(5);
      ticks.slice(1).forEach((tick, i) => expect(tick).toBeGreaterThan(ticks[i]));
      expect(ticks[ticks.length - 1]).toBeGreaterThan(GAME_START + 50);
      expect(ticks[ticks.length - 1]).toBeLessThanOrEqual(GAME_START + 60);
    });
  });

  describe('jumps', () => {
    beforeEach(() => setup({ config: { passBudgetMs: 0 } }));

    it('cancels a running jump', async () => {
      await firstValueFrom(service.loadPlayer(PLAYER));
      const progress: ProgressPayload[] = [];
      const subscription = service.progress$.subscribe((payload) => progress.push(payload));
      await firstValueFrom(service.jumpTo({ kind: 'next-month' }));
      engine.timeline.step();
      expect(
        await firstValueFrom(service.setSpeed('1h')).catch((e: EngineCommandError) => e.code),
      ).toBe('busy');
      await firstValueFrom(service.cancelJump());
      subscription.unsubscribe();
      expect(progress.map(({ state }) => state)).toEqual(['running', 'cancelled']);
    });
  });

  describe('quotes', () => {
    beforeEach(() => setup());

    it('sends one subscribe per series and the unsubscribe after the last subscriber', async () => {
      await firstValueFrom(service.loadPlayer(PLAYER));
      const first: number[][] = [];
      const second: number[][] = [];
      const a = service.quotes([0]).subscribe((quotes) => first.push(quotes.map((q) => q.series)));
      const b = service
        .quotes([0, 1])
        .subscribe((quotes) => second.push(quotes.map((q) => q.series)));
      await engine.advance(300);
      expect(received('subscribe').map(({ payload }) => payload)).toEqual([
        { series: [0] },
        { series: [1] },
      ]);
      expect(first[first.length - 1]).toEqual([0]);
      expect(second[second.length - 1]).toEqual([0, 1]);

      a.unsubscribe();
      await engine.idle();
      expect(received('unsubscribe')).toEqual([]);
      b.unsubscribe();
      await engine.idle();
      expect(received('unsubscribe').map(({ payload }) => payload)).toEqual([{ series: [0, 1] }]);
    });
  });

  describe('worker failures', () => {
    let fatal: EngineFatal[];
    let subscription: Subscription | undefined;

    function start(options: InProcessEngineOptions = {}): void {
      setup(options);
      fatal = [];
      subscription = service.fatal$.subscribe((event) => fatal.push(event));
    }

    afterEach(() => subscription?.unsubscribe());

    it('restarts the worker and loads the last player with its subscriptions again', async () => {
      start();
      await firstValueFrom(service.loadPlayer(PLAYER));
      const quotes = service.quotes([1]).subscribe();
      await firstValueFrom(service.setVisibility(false));
      const pending = firstValueFrom(service.query({ kind: 'exchanges' })).catch(
        (e: EngineCommandError) => e.code,
      );
      engine.crash('boom');
      expect(await pending).toBe('worker-failed');
      await engine.idle();
      expect(fatal).toEqual([{ message: 'the engine worker failed: boom', restarting: true }]);
      expect(engine.workers).toHaveLength(2);
      expect(engine.workers[0].terminated).toBe(true);
      expect(received('loadPlayer', 1).map(({ payload }) => payload)).toEqual([PLAYER]);
      expect(received('subscribe', 1).map(({ payload }) => payload)).toEqual([{ series: [1] }]);
      expect(received('setVisibility', 1).map(({ payload }) => payload)).toEqual([
        { visible: false },
      ]);
      expect(await firstValueFrom(service.setSpeed('1h'))).toBeNull();
      quotes.unsubscribe();
    });

    it('treats a fatal event of the worker like a failure', async () => {
      start({ prices: () => new TestMarket([]) });
      await firstValueFrom(service.loadPlayer(PLAYER));
      const quotes = service.quotes([5]).subscribe();
      await engine.advance(100);
      expect(fatal[0]).toEqual({ message: expect.stringContaining('series 5'), restarting: true });
      expect(engine.workers.length).toBeGreaterThan(1);
      quotes.unsubscribe();
    });

    it('gives up after three failures in a row', async () => {
      start();
      await firstValueFrom(service.loadPlayer(PLAYER));
      for (let failure = 0; failure < 3; failure++) {
        engine.crash();
        await engine.idle();
      }
      expect(fatal.map(({ restarting }) => restarting)).toEqual([true, true, false]);
      expect(engine.workers).toHaveLength(3);
      const error = await firstValueFrom(service.pause()).catch((e: EngineCommandError) => e.code);
      expect(error).toBe('worker-failed');
      expect(engine.workers).toHaveLength(3);
    });

    it('counts again when the game time moved past the last failure', async () => {
      start();
      await firstValueFrom(service.loadPlayer(PLAYER));
      for (let failure = 0; failure < 4; failure++) {
        await firstValueFrom(service.resume());
        await engine.advance((failure + 1) * 5_000);
        engine.crash();
        await engine.idle();
      }
      expect(fatal.map(({ restarting }) => restarting)).toEqual([true, true, true, true]);
    });
  });
});
