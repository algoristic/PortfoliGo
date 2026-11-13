import { ClosedMonth } from '@app/banking/domain/models/household.model';
import { Tick } from '@app/clock/domain/models/time.model';
import {
  autoPauseEnabled,
  isAutoPauseCode,
  withAutoPause,
} from '@app/notifications/domain/auto-pause-logic';
import {
  GameNotification,
  NotificationDraft,
} from '@app/notifications/domain/models/notification.model';
import { markRead, normalizeReadState } from '@app/notifications/domain/read-state-logic';
import { TaxYear } from '@app/taxes/domain/models/tax.model';

import {
  CommandResult,
  MarkNotificationsReadCommand,
  SetAutoPauseCommand,
} from './models/engine-command.model';
import { EngineEvent } from './models/engine-event.model';
import { PlayerState } from './models/game-state.model';

/**
 * Notifications of the engine (TS §12): created from its events with a running number, buffered
 * until the host drains them, and counted, read and configured in the player state. The engine
 * knows neither visibility nor run mode; it only marks the first buffered notification whose code
 * pauses the game, and the host decides whether the pause applies.
 */
export class NotificationSystem {
  readonly #player: PlayerState;
  #buffer: GameNotification[] = [];
  #autoPause: GameNotification | null = null;

  constructor(player: PlayerState) {
    this.#player = player;
  }

  /** First notification since the last `drain` whose code has auto-pause on, else `null`. */
  get autoPauseNotification(): GameNotification | null {
    return this.#autoPause;
  }

  drain(): GameNotification[] {
    const buffer = this.#buffer;
    this.#buffer = [];
    this.#autoPause = null;
    return buffer;
  }

  /**
   * Notifications of an engine event (TS §12): account coverage, credit interest and refunds,
   * executed, rejected and expired orders (a triggered stop notifies nothing).
   */
  fromEvent(event: EngineEvent): void {
    switch (event.type) {
      case 'account-uncovered':
      case 'overdraft-limit-exceeded': {
        const { accountId, balance, limit } = event;
        this.#notify(event.tick, { code: event.type, params: { accountId, balance, limit } });
        break;
      }
      case 'interest-credited': {
        const { accountId, amount, tax } = event;
        this.#notify(event.tick, { code: 'interest-credited', params: { accountId, amount, tax } });
        if (tax < 0) {
          this.#notify(event.tick, { code: 'tax-refund', params: { accountId, amount: -tax } });
        }
        break;
      }
      case 'order-executed': {
        const { orderId, depotId, instrumentId, side, quantity, price, total } = event;
        this.#notify(event.tick, {
          code: 'order-executed',
          params: { orderId, depotId, instrumentId, side, quantity, price, total },
        });
        break;
      }
      case 'order-rejected': {
        const { orderId, depotId, instrumentId, side, reason } = event;
        this.#notify(event.tick, {
          code: 'order-rejected',
          params: { orderId, depotId, instrumentId, side, reason },
        });
        break;
      }
      case 'order-expired': {
        const { orderId, depotId, instrumentId, side } = event;
        this.#notify(event.tick, {
          code: 'order-expired',
          params: { orderId, depotId, instrumentId, side },
        });
        break;
      }
      default:
        break;
    }
  }

  /** The month closed with these household values (US-EK-03). */
  monthClosed(tick: Tick, closed: Readonly<ClosedMonth>): void {
    const { year, month } = closed.month;
    this.#notify(tick, {
      code: 'month-closed',
      params: { year, month, values: { ...closed.values } },
    });
  }

  /** The tax year closed (TS §7.7). */
  yearClosed(tick: Tick, taxYear: Readonly<TaxYear>): void {
    this.#notify(tick, {
      code: 'year-closed',
      params: { year: taxYear.year, taxableIncome: taxYear.income, taxWithheld: taxYear.withheld },
    });
  }

  setAutoPause(command: SetAutoPauseCommand): CommandResult {
    if (typeof command.enabled !== 'boolean') {
      return { ok: false, error: 'invalid-command' };
    }
    if (!isAutoPauseCode(command.code)) {
      return { ok: false, error: 'unknown-notification-code' };
    }
    const state = this.#player.notifications;
    state.autoPause = withAutoPause(state.autoPause, command.code, command.enabled);
    return { ok: true };
  }

  markRead(command: MarkNotificationsReadCommand): CommandResult {
    const { upTo, seqs } = command;
    if (
      (upTo !== undefined && !Number.isSafeInteger(upTo)) ||
      (seqs !== undefined && (!Array.isArray(seqs) || !seqs.every(Number.isSafeInteger)))
    ) {
      return { ok: false, error: 'invalid-command' };
    }
    const state = this.#player.notifications;
    const result = markRead(state, state.nextSeq - 1, { upTo, seqs });
    if (!result.ok) {
      return result;
    }
    state.readUpTo = result.state.readUpTo;
    state.readSeqs = result.state.readSeqs;
    return { ok: true };
  }

  #notify(tick: Tick, draft: NotificationDraft): void {
    const state = this.#player.notifications;
    const notification = { ...draft, seq: state.nextSeq++, tick } as GameNotification;
    const read = normalizeReadState(state, notification.seq);
    state.readUpTo = read.readUpTo;
    state.readSeqs = read.readSeqs;
    this.#buffer.push(notification);
    if (
      this.#autoPause === null &&
      isAutoPauseCode(notification.code) &&
      autoPauseEnabled(state.autoPause, notification.code)
    ) {
      this.#autoPause = notification;
    }
  }
}
