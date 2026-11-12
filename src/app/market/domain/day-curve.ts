import { MINUTES_PER_DAY } from '@app/clock/domain/models/time.model';

import { utf8Encode } from '@app/simulation/util/hash128';

import { StreamFamily } from '@app/simulation/util/random-stream';

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
import { seriesRef } from './series';

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
  /** Price index curves per index; total return curves are derived on each call. */
  readonly #indexCurves: (Float64Array | undefined)[];
  readonly #indexDone: Uint8Array;
  /**
   * Indicative values per share, per index and per ETF, indexed by the minute of the day. Only the
   * minutes in `[from, to]` are valid; ETF sessions need a part of the day only.
   */
  readonly #indicative: CurveRanges;
  readonly #indicativeIndex: CurveRanges;
  readonly #etf: CurveRanges;
  readonly #idio: Float64Array;
  #support: SupportValues | null = null;

  constructor(tables: CurveTables) {
    const { layout, indices, etfs } = tables.context;
    const instrumentCount = layout.instrumentIds.length;
    this.#tables = tables;
    this.#factorCurves = new Array(layout.factorIds.length);
    this.#factorDone = new Uint8Array(layout.factorIds.length * (layout.boundaries.length - 1));
    this.#instrumentCurves = new Array(instrumentCount);
    this.#instrumentDone = new Uint8Array(instrumentCount);
    this.#indexCurves = new Array(indices.ids.length);
    this.#indexDone = new Uint8Array(indices.ids.length);
    this.#indicative = new CurveRanges(instrumentCount);
    this.#indicativeIndex = new CurveRanges(indices.ids.length);
    this.#etf = new CurveRanges(etfs.ids.length);
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
    this.#indexDone.fill(0);
    this.#indicative.reset();
    this.#indicativeIndex.reset();
    this.#etf.reset();
    this.#support = null;
    return this;
  }

  /**
   * Values of a series (shares, indices, ETFs) from its session open (index 0) to its session
   * close. The session of an index runs from the earliest open to the latest close of its
   * constituents' exchanges; an ETF trades in the session of its own exchange.
   */
  seriesCurve(series: number): Float64Array {
    const { kind, index } = seriesRef(this.#tables.context, series);
    if (kind === 'stock') {
      return this.instrumentCurve(index);
    }
    if (kind === 'etf') {
      const { etfs, layout } = this.#tables.context;
      const open = layout.boundaries[etfs.openBoundary[index]];
      const close = layout.boundaries[etfs.closeBoundary[index]];
      return this.#etfCurve(index, open, close).subarray(open, close + 1);
    }
    const levels = this.indexCurve(index);
    if (kind === 'index') {
      return levels;
    }
    const { indices, layout } = this.#tables.context;
    return withReinvestment(
      levels,
      layout.boundaries[indices.openBoundary[index]],
      this.day.indexReinvest,
      index * layout.boundaries.length,
      layout.boundaries,
    );
  }

  /**
   * Indicative values of a series for every minute of the day (0 … 1440, TS §6.6). During its
   * session a share has its minute price; outside, its last price moves with the factor bridges
   * (`c_i + Σ β_ik · F_k(m) + U_i` with `U_i` of the previous or this close). Indices and ETFs
   * are built from the indicative values of their constituents. For shares and ETFs, the values
   * inside the session equal `seriesCurve`.
   */
  indicativeCurve(series: number): Float64Array {
    const { kind, index } = seriesRef(this.#tables.context, series);
    if (kind === 'stock') {
      return this.#indicativeInstrument(index, 0, MINUTES_PER_DAY);
    }
    if (kind === 'etf') {
      return this.#etfCurve(index, 0, MINUTES_PER_DAY);
    }
    const levels = this.#indicativeLevels(index, 0, MINUTES_PER_DAY);
    if (kind === 'index') {
      return levels;
    }
    const { layout } = this.#tables.context;
    return withReinvestment(
      levels,
      0,
      this.day.indexReinvest,
      index * layout.boundaries.length,
      layout.boundaries,
    );
  }

  /**
   * Price index x for every minute of its session (TS §6.6): `Σ n_i · P_i(m) / D`, summed in the
   * constituent order. Constituents before their open count with the previous close, after their
   * close with the close.
   */
  indexCurve(x: number): Float64Array {
    const existing = this.#indexCurves[x];
    if (existing !== undefined && this.#indexDone[x] === 1) {
      return existing;
    }
    const day = this.day;
    const { indices, layout, config } = this.#tables.context;
    const open = layout.boundaries[indices.openBoundary[x]];
    const length = layout.boundaries[indices.closeBoundary[x]] - open;
    const curve = existing ?? new Float64Array(length + 1);
    curve.fill(0);
    for (let n = indices.memberStart[x]; n < indices.memberStart[x + 1]; n++) {
      const i = indices.members[n];
      const shares = indices.shares[n];
      const memberCurve = this.instrumentCurve(i);
      const memberOpen = layout.boundaries[layout.openBoundary[i]] - open;
      const memberLength = memberCurve.length - 1;
      const previous = priceFromLog(day.prevLogClose[i], config.priceFloor);
      const last = memberCurve[memberLength];
      for (let m = 0; m <= length; m++) {
        const j = m - memberOpen;
        curve[m] += shares * (j < 0 ? previous : j <= memberLength ? memberCurve[j] : last);
      }
    }
    const divisor = indices.divisor[x];
    for (let m = 0; m <= length; m++) {
      curve[m] /= divisor;
    }
    this.#indexCurves[x] = curve;
    this.#indexDone[x] = 1;
    return curve;
  }

  /**
   * Official close of a series from the support points only (TS §4.5, rule 8); bit for bit the
   * last value of `seriesCurve`.
   */
  seriesClose(series: number): number {
    return this.#supportValues().value(series, 'close');
  }

  /** Open of a series from the support points only; bit for bit the first value of the curve. */
  seriesOpen(series: number): number {
    return this.#supportValues().value(series, 'open');
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
    const { layout, config } = this.#tables.context;
    const openBoundary = layout.openBoundary[i];
    const closeBoundary = layout.closeBoundary[i];
    const open = layout.boundaries[openBoundary];
    const length = layout.boundaries[closeBoundary] - open;
    const curve =
      existing !== undefined && existing.length === length + 1
        ? existing
        : new Float64Array(length + 1);

    const idio = this.#idio;
    fillSessionIdio(this.#tables, day, i, idio);
    const curves: Float64Array[] = [];
    for (let l = 0; l < LOADINGS_PER_INSTRUMENT; l++) {
      const k = layout.loadingFactors[i * LOADINGS_PER_INSTRUMENT + l];
      curves.push(this.factorCurve(k, openBoundary, closeBoundary));
    }
    const logBase = layout.logBase[i];
    const floor = config.priceFloor;
    const jumpEnd = day.jumpStart[i] + day.jumpCount[i];
    let nextJump = day.jumpStart[i];
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
      curve[j] = priceFromLog(sessionLog(logBase, factor, day.idioOpen[i], idio[j], jumps), floor);
    }
    curve[length] = priceFromLog(day.logClose[i], floor);
    this.#instrumentCurves[i] = curve;
    this.#instrumentDone[i] = 1;
    return curve;
  }

  #indicativeInstrument(i: number, requestFrom: number, requestTo: number): Float64Array {
    const ranges = this.#indicative;
    const existing = ranges.curves[i];
    if (existing !== undefined && ranges.covers(i, requestFrom, requestTo)) {
      return existing;
    }
    const [from, to] = ranges.union(i, requestFrom, requestTo);
    const day = this.day;
    const { layout, config } = this.#tables.context;
    const curve = existing ?? new Float64Array(MINUTES_PER_DAY + 1);
    const session = this.instrumentCurve(i);
    const curves: Float64Array[] = [];
    for (let l = 0; l < LOADINGS_PER_INSTRUMENT; l++) {
      const k = layout.loadingFactors[i * LOADINGS_PER_INSTRUMENT + l];
      curves.push(
        this.factorCurve(
          k,
          boundaryAtOrBefore(layout.boundaries, from),
          boundaryAtOrAfter(layout.boundaries, to),
        ),
      );
    }
    const open = layout.boundaries[layout.openBoundary[i]];
    const close = layout.boundaries[layout.closeBoundary[i]];
    const logBase = layout.logBase[i];
    const floor = config.priceFloor;
    for (let m = from; m <= to; m++) {
      if (m >= open && m <= close) {
        curve[m] = session[m - open];
        continue;
      }
      let factor = 0;
      for (let l = 0; l < LOADINGS_PER_INSTRUMENT; l++) {
        factor += layout.loadings[i * LOADINGS_PER_INSTRUMENT + l] * curves[l][m];
      }
      const idio = m < open ? day.prevIdioClose[i] : day.idioClose[i];
      curve[m] = priceFromLog(frozenLog(logBase, factor, idio), floor);
    }
    ranges.store(i, curve, from, to);
    return curve;
  }

  /** Indicative level of index x for the minutes `[from, to]`, summed in the constituent order. */
  #indicativeLevels(x: number, requestFrom: number, requestTo: number): Float64Array {
    const ranges = this.#indicativeIndex;
    const existing = ranges.curves[x];
    if (existing !== undefined && ranges.covers(x, requestFrom, requestTo)) {
      return existing;
    }
    const [from, to] = ranges.union(x, requestFrom, requestTo);
    const { indices } = this.#tables.context;
    const curve = existing ?? new Float64Array(MINUTES_PER_DAY + 1);
    curve.fill(0, from, to + 1);
    for (let n = indices.memberStart[x]; n < indices.memberStart[x + 1]; n++) {
      const shares = indices.shares[n];
      const values = this.#indicativeInstrument(indices.members[n], from, to);
      for (let m = from; m <= to; m++) {
        curve[m] += shares * values[m];
      }
    }
    const divisor = indices.divisor[x];
    for (let m = from; m <= to; m++) {
      curve[m] /= divisor;
    }
    ranges.store(x, curve, from, to);
    return curve;
  }

  /** NAV of ETF e for the minutes `[from, to]` from the indicative level of its index (TS §6.6). */
  #etfCurve(e: number, requestFrom: number, requestTo: number): Float64Array {
    const ranges = this.#etf;
    const existing = ranges.curves[e];
    if (existing !== undefined && ranges.covers(e, requestFrom, requestTo)) {
      return existing;
    }
    const [from, to] = ranges.union(e, requestFrom, requestTo);
    const day = this.day;
    const { etfs, layout } = this.#tables.context;
    const boundaries = layout.boundaries;
    const boundaryCount = boundaries.length;
    const x = etfs.indexOf[e];
    const distributing = etfs.distributions[e] !== null;
    const levels = this.#indicativeLevels(x, from, to);
    const scale = day.etfScale[e];
    const curve = existing ?? new Float64Array(MINUTES_PER_DAY + 1);
    let j = boundaryAtOrBefore(boundaries, from);
    for (let m = from; m <= to; m++) {
      while (j + 1 < boundaryCount && boundaries[j + 1] <= m) {
        j++;
      }
      curve[m] = etfValue(
        scale,
        levels[m],
        day.indexReinvest[x * boundaryCount + j],
        day.etfPot[e * boundaryCount + j],
        distributing,
      );
    }
    ranges.store(e, curve, from, to);
    return curve;
  }

  #supportValues(): SupportValues {
    this.#support ??= new SupportValues(this.#tables, this.day);
    return this.#support;
  }
}

/**
 * Opens and closes of all series of one day from the support points (TS §4.5, rule 8), bit for bit
 * the first and last values of `seriesCurve`. At the index open, only the constituents of the
 * first opening exchange have opened; at the index close, all have closed. ETFs need the
 * indicative values of their constituents at the boundary: factor levels at boundaries are
 * support points, only shares in their session at that moment need their idiosyncratic bridge.
 * Constituent values are computed once per boundary.
 */
export class SupportValues {
  readonly #tables: CurveTables;
  readonly #day: Readonly<MarketDay>;
  /** Indicative price per boundary and share (`j · S + i`), `NaN` until computed. */
  readonly #prices: Float64Array;
  #idio: Float64Array | null = null;

  constructor(tables: CurveTables, day: Readonly<MarketDay>) {
    const { layout } = tables.context;
    this.#tables = tables;
    this.#day = day;
    this.#prices = new Float64Array(layout.boundaries.length * layout.instrumentIds.length).fill(
      Number.NaN,
    );
  }

  value(series: number, at: 'open' | 'close'): number {
    const { context } = this.#tables;
    const { indices, layout, etfs, config } = context;
    const day = this.#day;
    const { kind, index } = seriesRef(context, series);
    const floor = config.priceFloor;
    if (kind === 'stock') {
      return priceFromLog(at === 'open' ? day.logOpen[index] : day.logClose[index], floor);
    }
    const boundaryCount = layout.boundaries.length;
    if (kind === 'etf') {
      const boundary = at === 'open' ? etfs.openBoundary[index] : etfs.closeBoundary[index];
      const x = etfs.indexOf[index];
      let sum = 0;
      for (let n = indices.memberStart[x]; n < indices.memberStart[x + 1]; n++) {
        sum += indices.shares[n] * this.#indicativePrice(indices.members[n], boundary);
      }
      return etfValue(
        day.etfScale[index],
        sum / indices.divisor[x],
        day.indexReinvest[x * boundaryCount + boundary],
        day.etfPot[index * boundaryCount + boundary],
        etfs.distributions[index] !== null,
      );
    }
    const boundary = at === 'open' ? indices.openBoundary[index] : indices.closeBoundary[index];
    let sum = 0;
    for (let n = indices.memberStart[index]; n < indices.memberStart[index + 1]; n++) {
      const i = indices.members[n];
      const logPrice =
        at === 'close'
          ? day.logClose[i]
          : layout.openBoundary[i] === boundary
            ? day.logOpen[i]
            : day.prevLogClose[i];
      sum += indices.shares[n] * priceFromLog(logPrice, floor);
    }
    const level = sum / indices.divisor[index];
    if (kind === 'index') {
      return level;
    }
    return level * day.indexReinvest[index * boundaryCount + boundary];
  }

  /** Indicative price of share i at boundary b, bit for bit the value of its indicative curve. */
  #indicativePrice(i: number, b: number): number {
    const { layout, config } = this.#tables.context;
    const count = layout.instrumentIds.length;
    const cached = this.#prices[b * count + i];
    if (!Number.isNaN(cached)) {
      return cached;
    }
    const day = this.#day;
    const floor = config.priceFloor;
    const boundaryCount = layout.boundaries.length;
    const openBoundary = layout.openBoundary[i];
    const closeBoundary = layout.closeBoundary[i];
    let factor = 0;
    for (let l = 0; l < LOADINGS_PER_INSTRUMENT; l++) {
      const k = layout.loadingFactors[i * LOADINGS_PER_INSTRUMENT + l];
      factor +=
        layout.loadings[i * LOADINGS_PER_INSTRUMENT + l] * day.factorLevels[k * boundaryCount + b];
    }
    let price: number;
    if (b === openBoundary) {
      price = priceFromLog(day.logOpen[i], floor);
    } else if (b === closeBoundary) {
      price = priceFromLog(day.logClose[i], floor);
    } else if (b < openBoundary || b > closeBoundary) {
      const idio = b < openBoundary ? day.prevIdioClose[i] : day.idioClose[i];
      price = priceFromLog(frozenLog(layout.logBase[i], factor, idio), floor);
    } else {
      this.#idio ??= new Float64Array(MINUTES_PER_DAY + 1);
      fillSessionIdio(this.#tables, day, i, this.#idio);
      const minute = layout.boundaries[b];
      const jumpEnd = day.jumpStart[i] + day.jumpCount[i];
      let jumps = 0;
      for (let n = day.jumpStart[i]; n < jumpEnd && day.jumpMinute[n] <= minute; n++) {
        jumps += day.jumpSize[n];
      }
      const j = minute - layout.boundaries[openBoundary];
      price = priceFromLog(
        sessionLog(layout.logBase[i], factor, day.idioOpen[i], this.#idio[j], jumps),
        floor,
      );
    }
    this.#prices[b * count + i] = price;
    return price;
  }
}

/**
 * Curves that are valid for a range of minutes per entry. A request outside the stored range
 * recomputes the union of both ranges, so the stored range stays contiguous.
 */
class CurveRanges {
  readonly curves: (Float64Array | undefined)[];
  readonly #from: Int32Array;
  readonly #to: Int32Array;

  constructor(count: number) {
    this.curves = new Array(count);
    this.#from = new Int32Array(count);
    this.#to = new Int32Array(count);
    this.reset();
  }

  reset(): void {
    this.#from.fill(1);
    this.#to.fill(0);
  }

  covers(n: number, from: number, to: number): boolean {
    return from >= this.#from[n] && to <= this.#to[n];
  }

  /** Range to compute for a request: the request joined with the stored range. */
  union(n: number, from: number, to: number): [number, number] {
    if (this.#from[n] > this.#to[n]) {
      return [from, to];
    }
    return [Math.min(this.#from[n], from), Math.max(this.#to[n], to)];
  }

  store(n: number, curve: Float64Array, from: number, to: number): void {
    this.curves[n] = curve;
    this.#from[n] = from;
    this.#to[n] = to;
  }
}

/** Last boundary at or before `minute`. */
function boundaryAtOrBefore(boundaries: Int32Array, minute: number): number {
  let j = boundaries.length - 1;
  while (j > 0 && boundaries[j] > minute) {
    j--;
  }
  return j;
}

/** First boundary at or after `minute`. */
function boundaryAtOrAfter(boundaries: Int32Array, minute: number): number {
  let j = 0;
  while (j < boundaries.length - 1 && boundaries[j] < minute) {
    j++;
  }
  return j;
}

/** Log price inside the session: factors, `U_i` at the open, the bridge and the jumps so far. */
function sessionLog(
  logBase: number,
  factor: number,
  idioOpen: number,
  bridge: number,
  jumps: number,
): number {
  return logBase + factor + (idioOpen + bridge + jumps);
}

/**
 * Log price outside the session with `U_i` frozen at a close; same operation order as the close
 * in the day step, so at the close minute it equals the close bit for bit.
 */
function frozenLog(logBase: number, factor: number, idio: number): number {
  return logBase + factor + idio;
}

/** NAV from scale, index level and `R` (accumulating) or pot (distributing). */
export function etfValue(
  scale: number,
  level: number,
  reinvest: number,
  pot: number,
  distributing: boolean,
): number {
  return distributing ? scale * level + pot : scale * level * reinvest;
}

/** Idiosyncratic bridge of share i over its session without drift and jumps (index 0 = open). */
function fillSessionIdio(
  tables: CurveTables,
  day: Readonly<MarketDay>,
  i: number,
  idio: Float64Array,
): void {
  const jumpEnd = day.jumpStart[i] + day.jumpCount[i];
  let jumpSum = 0;
  for (let n = day.jumpStart[i]; n < jumpEnd; n++) {
    jumpSum += day.jumpSize[n];
  }
  fillBridge(
    idio,
    0,
    0,
    day.idioClose[i] - day.idioOpen[i] - jumpSum,
    tables.sessionTables[i],
    tables.sessionScale[i],
    tables.instrumentBridgeStreams[i].create(day.day, tables.bridgeSuffix),
  );
}

/** Multiplies a curve starting at minute `start` with `R` of the last boundary at or before. */
function withReinvestment(
  levels: Float64Array,
  start: number,
  reinvest: Float64Array,
  offset: number,
  boundaries: Int32Array,
): Float64Array {
  const result = new Float64Array(levels.length);
  let j = 0;
  for (let m = 0; m < levels.length; m++) {
    while (j + 1 < boundaries.length && boundaries[j + 1] <= start + m) {
      j++;
    }
    result[m] = levels[m] * reinvest[offset + j];
  }
  return result;
}
