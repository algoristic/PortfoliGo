import { inject, Injectable, OnDestroy } from '@angular/core';
import { defer, filter, map, Observable, Subject, take } from 'rxjs';

import { AccountId, OpenableAccountKind } from '@app/banking/domain/models/account.model';
import { SpeedId } from '@app/clock/domain/models/speed.model';
import { Tick } from '@app/clock/domain/models/time.model';
import { BackgroundMode } from '@app/engine/domain/models/game-state.model';
import { JumpTarget } from '@app/engine/domain/models/jump-target.model';
import { SeriesQuote } from '@app/engine/domain/models/series-quote.model';

import { ENGINE_WORKER_FACTORY, MAX_WORKER_FAILURES } from './engine-service.config';
import {
  ENGINE_PROTOCOL,
  EngineCommandMessage,
  EngineCommandPayloads,
  EngineCommandType,
  EngineErrorCode,
  EngineEventMessage,
  EngineEventPayloads,
  EngineEventType,
  EngineQuery,
  EngineQueryResultOf,
  EngineReplies,
  EngineWorkerPort,
  LoadPlayerPayload,
  TransferPayload,
} from './engine-service.model';
import { isEngineEventMessage } from './engine-service.utils';

/** Error codes of the service: the worker's codes plus a failed worker. */
export type EngineServiceErrorCode = EngineErrorCode | 'worker-failed';

/** Error of a command; `code` is what the UI maps to a text (TS §8.6). */
export class EngineCommandError extends Error {
  readonly code: EngineServiceErrorCode;

  constructor(code: EngineServiceErrorCode, message: string = code) {
    super(message);
    this.name = 'EngineCommandError';
    this.code = code;
  }
}

export interface EngineFatal {
  message: string;
  /** `false` after the third failure in a row: the worker is not started again (TS §8.5). */
  restarting: boolean;
}

/**
 * The UI's access to the engine worker (TS §8.2–§8.5). Every command is a cold Observable that
 * posts the command on subscription and emits the data of its reply; an error reply errors with
 * an `EngineCommandError`. Unsubscribing before the reply ignores it; the command still runs.
 *
 * A failing worker (`error`, `messageerror`, `fatal`) is restarted and the last loaded player is
 * loaded again with the open subscriptions; after three failures in a row without progress of the
 * game time beyond the last failure, the service gives up.
 */
@Injectable()
export class EngineService implements OnDestroy {
  readonly #createWorker = inject(ENGINE_WORKER_FACTORY);
  readonly #events = new Subject<EngineEventMessage>();
  /** Ends the open commands when the worker fails. */
  readonly #failures = new Subject<EngineCommandError>();
  readonly #fatal = new Subject<EngineFatal>();
  /** Subscribers per series (TS §8.4). */
  readonly #quoteCounts = new Map<number, number>();
  #worker?: EngineWorkerPort;
  #nextId = 1;
  #lastLoad?: LoadPlayerPayload;
  #visible?: boolean;
  #lastTick?: Tick;
  #failureTick?: Tick;
  #failuresInRow = 0;
  #givenUp = false;

  clock$ = this.#payloads('clock');
  progress$ = this.#payloads('progress');
  /**
   * Changed accounts and the net worth (TS §8.3, §8.4), at most four times per second; a full one
   * after every `loadPlayer`, also after a worker restart.
   */
  projection$ = this.#payloads('projection');
  /** Problems the engine survives, e.g. failed periodic writes (TS §9.5). */
  warning$ = this.#payloads('warning');
  fatal$ = this.#fatal.asObservable();

  loadPlayer(payload: LoadPlayerPayload): Observable<EngineReplies['loadPlayer']> {
    return defer(() => {
      this.#lastLoad = payload;
      return this.#request('loadPlayer', payload);
    });
  }

  unloadPlayer(): Observable<null> {
    return defer(() => {
      this.#lastLoad = undefined;
      return this.#request('unloadPlayer', {});
    });
  }

  setSpeed(speed: SpeedId): Observable<null> {
    return this.#request('setSpeed', { speed });
  }

  pause(): Observable<null> {
    return this.#request('pause', {});
  }

  resume(): Observable<null> {
    return this.#request('resume', {});
  }

  setVisibility(visible: boolean): Observable<null> {
    return defer(() => {
      this.#visible = visible;
      return this.#request('setVisibility', { visible });
    });
  }

  jumpTo(target: JumpTarget): Observable<EngineReplies['jumpTo']> {
    return this.#request('jumpTo', { target });
  }

  cancelJump(): Observable<null> {
    return this.#request('cancelJump', {});
  }

  /** The exchanges of the world (TS §3.3); the other queries have their own methods. */
  query(query: { kind: 'exchanges' }): Observable<EngineQueryResultOf<'exchanges'>> {
    return this.#query(query);
  }

  /** Banks of the world with their conditions (bank comparison, account cards). */
  banks(): Observable<EngineQueryResultOf<'banks'>> {
    return this.#query({ kind: 'banks' });
  }

  /**
   * What closing the account now would book, and what blocks it (TS §7.4); fails with
   * `unknown-account` or `account-closed`.
   */
  closingPreview(accountId: AccountId): Observable<EngineQueryResultOf<'closingPreview'>> {
    return this.#query({ kind: 'closingPreview', accountId });
  }

  /** The closed household months and the running one (US-EK-03). */
  monthlyValues(): Observable<EngineQueryResultOf<'monthlyValues'>> {
    return this.#query({ kind: 'monthlyValues' });
  }

  setBackgroundMode(mode: BackgroundMode): Observable<EngineReplies['setBackgroundMode']> {
    return this.#request('setBackgroundMode', { mode });
  }

  /** Opens an account, or a depot with its clearing account (`kind: 'depot'`). */
  openAccount(bankId: string, kind: OpenableAccountKind): Observable<EngineReplies['openAccount']> {
    return this.#request('openAccount', { bankId, kind });
  }

  /** Closes an account; a remainder after the settlement goes to `targetAccountId`. */
  closeAccount(
    accountId: AccountId,
    targetAccountId?: AccountId,
  ): Observable<EngineReplies['closeAccount']> {
    return this.#request(
      'closeAccount',
      targetAccountId === undefined ? { accountId } : { accountId, targetAccountId },
    );
  }

  setSalaryAccount(accountId: AccountId): Observable<EngineReplies['setSalaryAccount']> {
    return this.#request('setSalaryAccount', { accountId });
  }

  transfer(transfer: TransferPayload): Observable<EngineReplies['transfer']> {
    return this.#request('transfer', { ...transfer });
  }

  /**
   * Quotes of `series` (TS §8.4) as the worker sends them, at most four times per second. The
   * worker gets one `subscribe` per series however many views watch it, and the `unsubscribe` when
   * the last of them unsubscribes.
   */
  quotes(series: readonly number[]): Observable<SeriesQuote[]> {
    return new Observable<SeriesQuote[]>((subscriber) => {
      const wanted = new Set(series);
      const added = [...wanted].filter((s) => {
        const count = this.#quoteCounts.get(s) ?? 0;
        this.#quoteCounts.set(s, count + 1);
        return count === 0;
      });
      if (added.length > 0) {
        this.#notify('subscribe', { series: added });
      }
      const subscription = this.#payloads('quotes').subscribe(({ quotes }) => {
        const mine = quotes.filter((quote) => wanted.has(quote.series));
        if (mine.length > 0) {
          subscriber.next(mine);
        }
      });
      return () => {
        subscription.unsubscribe();
        const removed = [...wanted].filter((s) => {
          const count = (this.#quoteCounts.get(s) ?? 1) - 1;
          if (count > 0) {
            this.#quoteCounts.set(s, count);
            return false;
          }
          this.#quoteCounts.delete(s);
          return true;
        });
        if (removed.length > 0) {
          this.#notify('unsubscribe', { series: removed });
        }
      };
    });
  }

  ngOnDestroy(): void {
    this.#worker?.terminate();
    this.#worker = undefined;
  }

  #query<Q extends EngineQuery>(query: Q): Observable<EngineQueryResultOf<Q['kind']>> {
    // The worker answers a query with the result of its kind.
    return this.#request('query', { query }) as Observable<EngineQueryResultOf<Q['kind']>>;
  }

  #payloads<K extends EngineEventType>(type: K): Observable<EngineEventPayloads[K]> {
    return this.#events.pipe(
      filter(
        (message): message is Extract<EngineEventMessage, { type: K }> => message.type === type,
      ),
      map((message) => message.payload as EngineEventPayloads[K]),
    );
  }

  #request<K extends EngineCommandType>(
    type: K,
    payload: EngineCommandPayloads[K],
  ): Observable<EngineReplies[K]> {
    return new Observable<EngineReplies[K]>((subscriber) => {
      if (this.#givenUp) {
        subscriber.error(new EngineCommandError('worker-failed', 'the engine worker was given up'));
        return undefined;
      }
      const message = this.#message(type, payload);
      const subscription = this.#events
        .pipe(
          filter((event) => event.type === 'reply' && event.replyTo === message.id),
          take(1),
        )
        .subscribe((event) => {
          const reply = event.payload as EngineEventPayloads['reply'];
          if (reply.ok) {
            // The worker answers a command with the reply data of its type.
            subscriber.next(reply.data as EngineReplies[K]);
            subscriber.complete();
          } else {
            subscriber.error(new EngineCommandError(reply.error, reply.message));
          }
        });
      subscription.add(this.#failures.pipe(take(1)).subscribe((error) => subscriber.error(error)));
      this.#ensureWorker().postMessage(message);
      return subscription;
    });
  }

  /** Posts a command whose reply nobody waits for (subscriptions, restart). */
  #notify<K extends EngineCommandType>(type: K, payload: EngineCommandPayloads[K]): void {
    if (!this.#givenUp) {
      this.#ensureWorker().postMessage(this.#message(type, payload));
    }
  }

  #message<K extends EngineCommandType>(
    type: K,
    payload: EngineCommandPayloads[K],
  ): EngineCommandMessage {
    return {
      protocol: ENGINE_PROTOCOL,
      id: `u${this.#nextId++}`,
      type,
      payload,
    } as EngineCommandMessage;
  }

  #ensureWorker(): EngineWorkerPort {
    if (this.#worker === undefined) {
      const worker = this.#createWorker();
      worker.addEventListener('message', ({ data }) => {
        if (this.#worker !== worker || !isEngineEventMessage(data)) {
          return;
        }
        if (data.type === 'fatal') {
          this.#fail(worker, data.payload.message);
          return;
        }
        if (data.type === 'clock') {
          this.#onTick(data.payload.tick);
        }
        this.#events.next(data);
      });
      const onError = (event: Event): void => {
        if (this.#worker === worker) {
          const detail = event instanceof ErrorEvent && event.message ? event.message : event.type;
          this.#fail(worker, `the engine worker failed: ${detail}`);
        }
      };
      worker.addEventListener('error', onError);
      worker.addEventListener('messageerror', onError);
      this.#worker = worker;
    }
    return this.#worker;
  }

  /** Progress of the game time beyond the last failure ends a row of failures. */
  #onTick(tick: Tick): void {
    this.#lastTick = tick;
    if (this.#failureTick !== undefined && tick > this.#failureTick) {
      this.#failuresInRow = 0;
      this.#failureTick = undefined;
    }
  }

  #fail(worker: EngineWorkerPort, message: string): void {
    worker.terminate();
    this.#worker = undefined;
    this.#failuresInRow++;
    this.#failureTick = this.#lastTick;
    this.#givenUp = this.#failuresInRow >= MAX_WORKER_FAILURES;
    const restarting = !this.#givenUp && this.#lastLoad !== undefined;
    this.#failures.next(new EngineCommandError('worker-failed', message));
    this.#fatal.next({ message, restarting });
    if (restarting) {
      this.#restart();
    }
  }

  /** New worker with the last loaded player, the visibility and the open subscriptions. */
  #restart(): void {
    if (this.#visible !== undefined) {
      this.#notify('setVisibility', { visible: this.#visible });
    }
    const load = this.#lastLoad;
    if (load !== undefined) {
      const worker = this.#ensureWorker();
      this.#request('loadPlayer', load).subscribe({
        error: (error: unknown) => {
          if (
            this.#worker === worker &&
            !(error instanceof EngineCommandError && error.code === 'worker-failed')
          ) {
            this.#fail(worker, error instanceof Error ? error.message : String(error));
          }
        },
      });
    }
    const series = [...this.#quoteCounts.keys()];
    if (series.length > 0) {
      this.#notify('subscribe', { series });
    }
  }
}
