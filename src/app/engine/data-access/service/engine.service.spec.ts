import { Injector } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom, Observable, Subscription } from 'rxjs';

import { TestMarket, TestPrice } from '@app/engine/domain/testing/test-market';
import { IndexedDbService } from '@app/persistence/data-access/indexed-db/indexed-db.service';
import { FakePlayerLocks } from '@app/persistence/data-access/testing/fake-player-locks';

import {
  ClockPayload,
  EngineCommandMessage,
  ProgressPayload,
  ProjectionPayload,
} from './engine-service.model';
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

/** Series 0 at 100, every other series (indices of the absence report included) at 50. */
function market(): TestMarket {
  const prices: TestPrice[][] = Array.from({ length: 1_000 }, () => [{ tick: 0, price: 50 }]);
  prices[0] = [{ tick: 0, price: 100 }];
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

  describe('banking', () => {
    beforeEach(() => setup());

    async function homeBankId(): Promise<string> {
      const { banks } = await firstValueFrom(service.banks());
      return banks.find(({ type }) => type === 'branch')?.id as string;
    }

    it('opens, transfers, switches the salary account and closes with the replies of the engine', async () => {
      const projections: ProjectionPayload[] = [];
      const subscription = service.projection$.subscribe((payload) => projections.push(payload));
      await firstValueFrom(service.loadPlayer(PLAYER));
      const bankId = await homeBankId();
      expect(await firstValueFrom(service.openAccount(bankId, 'current'))).toEqual({
        tick: GAME_START,
        accountId: 'acc-2',
        depotId: null,
      });
      expect(
        await firstValueFrom(
          service.transfer({
            fromAccountId: 'acc-1',
            toAccountId: 'acc-2',
            amount: 500_000,
            purpose: 'Umzug',
          }),
        ),
      ).toEqual({ tick: GAME_START });
      expect(await firstValueFrom(service.setSalaryAccount('acc-2'))).toEqual({ tick: GAME_START });
      expect(await firstValueFrom(service.closeAccount('acc-1', 'acc-2'))).toEqual({
        tick: GAME_START,
      });
      expect(received('closeAccount').map(({ payload }) => payload)).toEqual([
        { accountId: 'acc-1', targetAccountId: 'acc-2' },
      ]);
      // A full projection after loading, then the changed accounts of each command.
      expect(projections.map(({ full, accounts }) => [full, accounts.map(({ id }) => id)])).toEqual(
        [
          [true, ['acc-1']],
          [false, ['acc-2']],
          [false, ['acc-1', 'acc-2']],
          [false, ['acc-1', 'acc-2']],
          [false, ['acc-1', 'acc-2']],
        ],
      );
      subscription.unsubscribe();
    });

    it('errors with the code of the engine', async () => {
      await firstValueFrom(service.loadPlayer(PLAYER));
      const code = (observable: Observable<unknown>): Promise<unknown> =>
        firstValueFrom(observable).catch((e: EngineCommandError) => e.code);
      expect(await code(service.closeAccount('acc-1'))).toBe('salary-account');
      expect(await code(service.setSalaryAccount('acc-3'))).toBe('unknown-account');
      expect(await code(service.openAccount('nope', 'depot'))).toBe('unknown-bank');
      expect(
        await code(
          service.transfer({
            fromAccountId: 'acc-1',
            toAccountId: 'acc-1',
            amount: 1,
            purpose: '',
          }),
        ),
      ).toBe('same-account');
      expect(await code(service.closingPreview('acc-7'))).toBe('unknown-account');
    });

    it('answers the closing preview and the monthly values', async () => {
      await firstValueFrom(service.loadPlayer(PLAYER));
      const { preview } = await firstValueFrom(service.closingPreview('acc-1'));
      expect(preview.blockers).toEqual(['salary-account']);
      const values = await firstValueFrom(service.monthlyValues());
      expect(values.closedMonths).toEqual([]);
      expect(values.current.month).toEqual({ year: 2030, month: 4 });
    });

    it('answers a statement page', async () => {
      const { tick } = await firstValueFrom(service.loadPlayer(PLAYER));
      const result = await firstValueFrom(
        service.statement({ accountId: 'acc-1', offset: 0, limit: 10 }),
      );
      expect(result).toMatchObject({
        kind: 'statement',
        total: 1,
        tick,
        entries: [{ seq: 1, type: 'opening-balance', amount: PLAYER.start.startCapital }],
      });
      const failure = await firstValueFrom(
        service.statement({ accountId: 'acc-7', offset: 0, limit: 10 }),
      ).catch((e: EngineCommandError) => e.code);
      expect(failure).toBe('unknown-account');
    });
  });

  describe('notifications', () => {
    /** Living costs far beyond the limit: the first bank run (06:00) exceeds it (TS §12). */
    const OVERDRAWN = {
      ...PLAYER,
      start: { startCapital: 0, netIncome: 100_000, livingCosts: 5_000_000 },
    };
    const BANK_RUN = GAME_START + 6 * 60;

    beforeEach(() => setup());

    it('streams the notifications and the auto-pause and answers the centre and its commands', async () => {
      const notified: number[] = [];
      const projections: ProjectionPayload[] = [];
      const clocks: ClockPayload[] = [];
      const subscriptions = [
        service.clock$.subscribe((payload) => clocks.push(payload)),
        service.notification$.subscribe(({ notifications }) =>
          notified.push(...notifications.map(({ seq }) => seq)),
        ),
        service.projection$.subscribe((payload) => projections.push(payload)),
      ];
      await firstValueFrom(service.loadPlayer(OVERDRAWN));
      await firstValueFrom(service.setSpeed('1h'));
      await firstValueFrom(service.resume());
      await engine.advance(10_000);
      await engine.advance(200);
      expect(clocks.at(-1)).toMatchObject({
        tick: BANK_RUN,
        paused: true,
        autoPause: { seq: 2, code: 'overdraft-limit-exceeded' },
      });
      expect(notified).toEqual([1, 2]);

      const page = await firstValueFrom(service.notifications({ offset: 0, limit: 10 }));
      expect(page.total).toBe(2);
      expect(page.entries.map(({ code, read }) => [code, read])).toEqual([
        ['overdraft-limit-exceeded', false],
        ['account-uncovered', false],
      ]);
      expect(await firstValueFrom(service.markNotificationsRead({ upTo: 2 }))).toEqual({
        tick: BANK_RUN,
      });
      expect(await firstValueFrom(service.setAutoPause('account-uncovered', true))).toEqual({
        tick: BANK_RUN,
      });
      expect(projections.at(-1)?.notifications).toMatchObject({
        lastSeq: 2,
        unread: 0,
        autoPause: { 'account-uncovered': true, 'overdraft-limit-exceeded': true },
      });
      const error = await firstValueFrom(service.markNotificationsRead({ upTo: 3 })).catch(
        (e: unknown) => e,
      );
      expect((error as EngineCommandError).code).toBe('unknown-notification');
      subscriptions.forEach((subscription) => subscription.unsubscribe());
    });

    it('emits the absence report after catching up and answers it again on request', async () => {
      const reports: unknown[] = [];
      const subscription = service.report$.subscribe((report) => reports.push(report));
      await firstValueFrom(service.loadPlayer(OVERDRAWN));
      await firstValueFrom(service.resume());
      await firstValueFrom(service.unloadPlayer());
      await engine.advance(7 * 3_600_000);
      await firstValueFrom(service.loadPlayer(OVERDRAWN));
      await engine.advance(100);
      subscription.unsubscribe();

      expect(reports).toEqual([
        expect.objectContaining({ from: GAME_START, to: GAME_START + 7 * 60, warningCount: 2 }),
      ]);
      expect(await firstValueFrom(service.absenceReport())).toEqual({
        kind: 'absenceReport',
        report: reports[0],
      });
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

  describe('market', () => {
    // The model's prices, so that the screener's daily closes and the quotes agree.
    beforeEach(() => setup({ prices: undefined }));

    it('answers the instruments, their details and the screener', async () => {
      const { tick } = await firstValueFrom(service.loadPlayer(PLAYER));
      const { instruments } = await firstValueFrom(service.instruments());
      const stock = instruments[0];
      expect(stock.kind).toBe('stock');
      const { details } = await firstValueFrom(service.instrumentDetails(stock.id));
      expect(details).toMatchObject({ kind: 'stock', id: stock.id });
      const failure = await firstValueFrom(service.instrumentDetails('cmp-999')).catch(
        (e: EngineCommandError) => e.code,
      );
      expect(failure).toBe('unknown-instrument');
      const result = await firstValueFrom(
        service.screener({ search: stock.ticker, assetClasses: ['stock'] }),
      );
      expect(result.tick).toBe(tick);
      expect(result.rows.map(({ id }) => id)).toContain(stock.id);
      expect(received('query').at(-1)?.payload).toEqual({
        query: { kind: 'screener', search: stock.ticker, assetClasses: ['stock'] },
      });
    });

    it('subscribes the movers once for all subscribers and resends them after a restart', async () => {
      await firstValueFrom(service.loadPlayer(PLAYER));
      const ticks: number[] = [];
      const a = service.movers().subscribe(({ tick }) => ticks.push(tick));
      const b = service.movers().subscribe();
      await engine.idle();
      expect(received('subscribe').map(({ payload }) => payload)).toEqual([
        { series: [], movers: true },
      ]);
      expect(ticks).toEqual([GAME_START]);

      engine.crash('boom');
      await engine.idle();
      expect(received('subscribe', 1).map(({ payload }) => payload)).toEqual([
        { series: [], movers: true },
      ]);

      a.unsubscribe();
      await engine.idle();
      expect(received('unsubscribe', 1)).toEqual([]);
      b.unsubscribe();
      await engine.idle();
      expect(received('unsubscribe', 1).map(({ payload }) => payload)).toEqual([
        { series: [], movers: true },
      ]);
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

    it('receives a full projection again from the restarted worker', async () => {
      start();
      const projections: ProjectionPayload[] = [];
      const projection = service.projection$.subscribe((payload) => projections.push(payload));
      await firstValueFrom(service.loadPlayer(PLAYER));
      engine.crash();
      await engine.idle();
      expect(projections.map(({ full }) => full)).toEqual([true, true]);
      expect(projections[1]).toEqual(projections[0]);
      projection.unsubscribe();
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

  describe('in-process engine on IndexedDB', () => {
    it('shows the stored clock to the UI and refuses the player to a second tab', async () => {
      const locks = new FakePlayerLocks();
      setup({ storage: 'indexed-db', locks });
      await firstValueFrom(service.loadPlayer(PLAYER));
      await engine.idle();
      const database = new IndexedDbService();
      expect(await firstValueFrom(database.get('runtime', 'p1'))).toMatchObject({
        playerId: 'p1',
        tick: GAME_START,
        paused: true,
      });

      const secondTab = new InProcessEngine({ storage: 'indexed-db', locks });
      const second = Injector.create({
        providers: [EngineService, provideInProcessEngineWorker(secondTab)],
        parent: TestBed.inject(Injector),
      }).get(EngineService);
      const error = await firstValueFrom(second.loadPlayer(PLAYER)).catch(
        (e: EngineCommandError) => e.code,
      );
      expect(error).toBe('player-locked');
      await firstValueFrom(service.unloadPlayer());
      expect(await firstValueFrom(second.loadPlayer(PLAYER))).toEqual({
        playerId: 'p1',
        tick: GAME_START,
      });
      second.ngOnDestroy();
    });
  });
});
