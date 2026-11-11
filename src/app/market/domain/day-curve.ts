import {
  BridgeTable,
  createBridgeTable,
  createUniformBridgeTable,
  fillBridge,
  profileWeights,
} from './bridge-logic';
import { MarketContext } from './market-context';
import { LOADINGS_PER_INSTRUMENT } from './market-layout';
import { MarketDay } from './models/market-day.model';
import { priceFromLog } from './price-logic';

import { MINUTES_PER_DAY } from '../../clock/domain/models/time.model';
import { utf8Encode } from '../../simulation/util/hash128';
import { StreamFamily } from '../../simulation/util/random-stream';

/** Everything the minute bridges need besides the support points, derived once per context. */
export interface CurveTables {
  context: MarketContext;
  /** Streams `market/factor/<id>/<day>/bridge/<interval>`: family per factor, suffix per interval. */
  factorBridgeStreams: readonly StreamFamily[];
  intervalSuffixes: readonly Uint8Array[];
  /** Uniform bridge per interval between two boundaries. */
  intervalTables: readonly BridgeTable[];
  /** Streams `market/instrument/<id>/<day>/bridge`. */
  instrumentBridgeStreams: readonly StreamFamily[];
  bridgeSuffix: Uint8Array;
  /** Session bridge per instrument (shared between sessions of the same length). */
  sessionTables: readonly BridgeTable[];
  /** Standard deviation of the idiosyncratic session move without drift and jumps. */
  sessionScale: Float64Array;
}

export function createCurveTables(context: MarketContext): CurveTables {
  const { layout, config } = context;
  const boundaries = layout.boundaries;
  const intervalCount = boundaries.length - 1;
  const intervalTables: BridgeTable[] = [];
  const intervalSuffixes: Uint8Array[] = [];
  for (let j = 0; j < intervalCount; j++) {
    intervalTables.push(createUniformBridgeTable(boundaries[j + 1] - boundaries[j]));
    intervalSuffixes.push(utf8Encode(`/bridge/${j}`));
  }
  const tablesByLength = new Map<number, BridgeTable>();
  const sessionTables = layout.instrumentIds.map((_id, i) => {
    const length = boundaries[layout.closeBoundary[i]] - boundaries[layout.openBoundary[i]];
    let table = tablesByLength.get(length);
    if (table === undefined) {
      table = createBridgeTable(profileWeights(config.intradayVolProfile, length));
      tablesByLength.set(length, table);
    }
    return table;
  });
  return {
    context,
    factorBridgeStreams: layout.factorIds.map(
      (id) => new StreamFamily(context.seedKey, `market/factor/${id}/`),
    ),
    intervalSuffixes,
    intervalTables,
    instrumentBridgeStreams: layout.instrumentIds.map(
      (id) => new StreamFamily(context.seedKey, `market/instrument/${id}/`),
    ),
    bridgeSuffix: utf8Encode('/bridge'),
    sessionTables,
    sessionScale: layout.idioVol.map(
      (vol) => context.sqrtSessionShare * vol * context.sqrtDayYears,
    ),
  };
}

/**
 * Minute values of one trading day, computed on demand from its support points (TS §6.1) and kept
 * until `load` switches to another day. Factor curves are indexed by the minute of the day
 * (0 … 1440); instrument curves hold the prices from the open to the close (`L + 1` values).
 * Pure cache: the values only depend on the support points and the bridge streams.
 */
export class DayCurves {
  readonly #tables: CurveTables;
  #day: Readonly<MarketDay> | null = null;
  readonly #factorCurves: (Float64Array | undefined)[];
  /** Per factor and interval (`k · intervals + j`): 1 when the interval is computed. */
  readonly #factorDone: Uint8Array;
  readonly #instrumentCurves: (Float64Array | undefined)[];
  readonly #instrumentDone: Uint8Array;
  readonly #idio: Float64Array;

  constructor(tables: CurveTables) {
    const { layout } = tables.context;
    this.#tables = tables;
    this.#factorCurves = new Array(layout.factorIds.length);
    this.#factorDone = new Uint8Array(layout.factorIds.length * (layout.boundaries.length - 1));
    this.#instrumentCurves = new Array(layout.instrumentIds.length);
    this.#instrumentDone = new Uint8Array(layout.instrumentIds.length);
    this.#idio = new Float64Array(MINUTES_PER_DAY + 1);
  }

  /** Support points of the loaded day; contains the closing prices, so it stays internal. */
  get day(): Readonly<MarketDay> {
    if (this.#day === null) {
      throw new Error('DayCurves: no day loaded');
    }
    return this.#day;
  }

  /** Switches to another day; the support points must not change while they are loaded. */
  load(day: Readonly<MarketDay>): this {
    this.#day = day;
    this.#factorDone.fill(0);
    this.#instrumentDone.fill(0);
    return this;
  }

  /**
   * Level of factor k for every minute between the boundaries `fromBoundary` and `toBoundary`
   * (inclusive, indexed by the minute of the day). Other minutes may be stale.
   */
  factorCurve(k: number, fromBoundary: number, toBoundary: number): Float64Array {
    const day = this.day;
    const { context, factorBridgeStreams, intervalSuffixes, intervalTables } = this.#tables;
    const { boundaries } = context.layout;
    const boundaryCount = boundaries.length;
    const intervalCount = boundaryCount - 1;
    let curve = this.#factorCurves[k];
    if (curve === undefined) {
      curve = new Float64Array(MINUTES_PER_DAY + 1);
      this.#factorCurves[k] = curve;
    }
    for (let j = fromBoundary; j < toBoundary; j++) {
      if (this.#factorDone[k * intervalCount + j] === 1) {
        continue;
      }
      const rng = factorBridgeStreams[k].create(day.day, intervalSuffixes[j]);
      fillBridge(
        curve,
        boundaries[j],
        day.factorLevels[k * boundaryCount + j],
        day.factorLevels[k * boundaryCount + j + 1],
        intervalTables[j],
        day.factorVols[k] * context.sqrtIntervalYears[j],
        rng,
      );
      this.#factorDone[k * intervalCount + j] = 1;
    }
    return curve;
  }

  /**
   * Prices of instrument i from the open (index 0) to the close (index L) of its exchange
   * (TS §6.4). Open and close are the support points; the inner minutes combine the factor bridges,
   * the idiosyncratic bridge and the jumps from their minute on.
   */
  instrumentCurve(i: number): Float64Array {
    const existing = this.#instrumentCurves[i];
    if (existing !== undefined && this.#instrumentDone[i] === 1) {
      return existing;
    }
    const day = this.day;
    const { context, instrumentBridgeStreams, bridgeSuffix, sessionTables, sessionScale } =
      this.#tables;
    const { layout, config } = context;
    const openBoundary = layout.openBoundary[i];
    const closeBoundary = layout.closeBoundary[i];
    const open = layout.boundaries[openBoundary];
    const length = layout.boundaries[closeBoundary] - open;
    const curve =
      existing !== undefined && existing.length === length + 1
        ? existing
        : new Float64Array(length + 1);

    const jumpStart = day.jumpStart[i];
    const jumpEnd = jumpStart + day.jumpCount[i];
    let jumpSum = 0;
    for (let n = jumpStart; n < jumpEnd; n++) {
      jumpSum += day.jumpSize[n];
    }
    const idioOpen = day.idioOpen[i];
    const idio = this.#idio;
    fillBridge(
      idio,
      0,
      0,
      day.idioClose[i] - idioOpen - jumpSum,
      sessionTables[i],
      sessionScale[i],
      instrumentBridgeStreams[i].create(day.day, bridgeSuffix),
    );

    const curves: Float64Array[] = [];
    for (let l = 0; l < LOADINGS_PER_INSTRUMENT; l++) {
      const k = layout.loadingFactors[i * LOADINGS_PER_INSTRUMENT + l];
      curves.push(this.factorCurve(k, openBoundary, closeBoundary));
    }
    const logBase = layout.logBase[i];
    const floor = config.priceFloor;
    let nextJump = jumpStart;
    let jumps = 0;
    curve[0] = priceFromLog(day.logOpen[i], floor);
    for (let j = 1; j < length; j++) {
      const minute = open + j;
      while (nextJump < jumpEnd && day.jumpMinute[nextJump] <= minute) {
        jumps += day.jumpSize[nextJump];
        nextJump++;
      }
      let factor = 0;
      for (let l = 0; l < LOADINGS_PER_INSTRUMENT; l++) {
        factor += layout.loadings[i * LOADINGS_PER_INSTRUMENT + l] * curves[l][minute];
      }
      curve[j] = priceFromLog(logBase + factor + (idioOpen + idio[j] + jumps), floor);
    }
    curve[length] = priceFromLog(day.logClose[i], floor);
    this.#instrumentCurves[i] = curve;
    this.#instrumentDone[i] = 1;
    return curve;
  }
}
