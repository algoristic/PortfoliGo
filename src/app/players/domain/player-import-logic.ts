import { GameSnapshot } from '@app/engine/domain/models/game-state.model';
import { marketChecksum } from '@app/market/domain/market-checksum';
import { MarketContext } from '@app/market/domain/market-context';
import { createFactorHistory } from '@app/market/domain/market-history';
import { restoreMarket } from '@app/market/domain/market-snapshot';
import { advanceMarket, createMarketDay, createMarketState } from '@app/market/domain/market-step';
import { MarketDay } from '@app/market/domain/models/market-day.model';
import {
  FactorHistory,
  FactorStateEntry,
  MarketState,
} from '@app/market/domain/models/market-state.model';

import { PlayerExport } from './models/player-export.model';
import { PLAYER_NAME_MAX_LENGTH } from './player-limits';
import { normalizePlayerName } from './player-logic';

/**
 * Day steps of the market from the epoch to the start of the export day (TS §10.3), in slices: the
 * market states at the month starts and the state at 00:00 of the export day, bit for bit those of
 * an uninterrupted run of the same world.
 */
export class MarketHistoryRun {
  readonly #context: MarketContext;
  readonly #toDay: number;
  readonly #state: MarketState;
  readonly #history: FactorHistory = createFactorHistory();
  readonly #out: MarketDay;

  constructor(context: MarketContext, toDay: number) {
    this.#context = context;
    this.#toDay = toDay;
    this.#state = createMarketState(context);
    this.#out = createMarketDay(context);
  }

  /** Days stepped so far and in all (calendar days since the epoch). */
  get done(): number {
    return this.#state.day;
  }

  get total(): number {
    return this.#toDay;
  }

  get complete(): boolean {
    return this.#state.day >= this.#toDay;
  }

  /** Steps day by day until done or `shouldYield` holds; `true` when the export day is reached. */
  run(shouldYield: () => boolean): boolean {
    while (!this.complete) {
      advanceMarket(
        this.#context,
        this.#state,
        this.#state.day + 1,
        { history: this.#history },
        this.#out,
      );
      if (shouldYield()) {
        break;
      }
    }
    return this.complete;
  }

  /** Market states at the month starts before the export day; complete runs only. */
  get monthStarts(): readonly FactorStateEntry[] {
    this.#assertComplete();
    return this.#history.monthStarts;
  }

  /** `marketChecksum` of the state at 00:00 of the export day; complete runs only. */
  get checksum(): string {
    this.#assertComplete();
    return marketChecksum(this.#state);
  }

  #assertComplete(): void {
    if (!this.complete) {
      throw new Error('MarketHistoryRun: the export day has not been reached');
    }
  }
}

/** The game an import continues (TS §10.3). */
export interface ImportedGame {
  /** State at the export tick: `state` of the file with the market after the export day's step. */
  snapshot: GameSnapshot;
  /**
   * Month starts of the run before the export day, then the exported market as the entry of the
   * export day: a restore starts from it, and the days before come from the run.
   */
  monthStarts: FactorStateEntry[];
  /** The run reached the exported market state (`marketChecksum`, TS §10.3 step 5). */
  marketChecksumMatches: boolean;
}

/**
 * The imported game (TS §10.1, §10.3): the exported state with the market that the day step of the
 * export day makes from the exported market (bit for bit the engine's market at the export tick),
 * and the month starts of the history run. On a checksum mismatch the game still continues from
 * the exported market.
 */
export function importedGame(
  context: MarketContext,
  exported: Pick<PlayerExport, 'state' | 'market' | 'marketChecksum'>,
  run: MarketHistoryRun,
): ImportedGame {
  const { state, market } = exported;
  if (run.total !== market.day) {
    throw new RangeError('importedGame: the history run does not end at the export day');
  }
  const current = restoreMarket(market);
  advanceMarket(context, current, market.day + 1);
  const before = run.monthStarts.filter(({ day }) => day < market.day);
  return {
    snapshot: {
      tick: state.tick,
      market: current,
      player: state.player,
      scheduler: state.scheduler,
      commandIds: state.commandIds.slice(),
    },
    monthStarts: [...before, restoreMarket(market)],
    marketChecksumMatches: run.checksum === exported.marketChecksum,
  };
}

/**
 * Name of an imported player (TS §10.3): the exported name with the suffix of the UI (e.g.
 * „ (Import)“), the name shortened so that both fit into `PLAYER_NAME_MAX_LENGTH` code points.
 */
export function importedPlayerName(name: string, suffix: string): string {
  const room = Math.max(0, PLAYER_NAME_MAX_LENGTH - [...suffix].length);
  const base = [...normalizePlayerName(name)].slice(0, room).join('').trimEnd();
  return normalizePlayerName(base + suffix);
}
