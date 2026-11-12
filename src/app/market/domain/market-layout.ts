import { MINUTES_PER_DAY } from '@app/clock/domain/models/time.model';
import { detLog } from '@app/simulation/util/det-math';
import { Company, DividendSchedule } from '@app/world/domain/models/company.model';
import { DividendFrequency } from '@app/world/domain/models/taxonomy.model';
import { World } from '@app/world/domain/models/world.model';

import { FACTOR_KINDS, FactorKind } from './models/market-config.model';

/** Number of factor loadings per instrument (TS §6.2): world, region, sector, industry, style, size. */
export const LOADINGS_PER_INSTRUMENT = FACTOR_KINDS.length;

/** Index of the world factor; it is always the first factor of the layout. */
export const WORLD_FACTOR = 0;

/**
 * Fixed order of factors and instruments with their parameters in flat arrays. All loops of the
 * market model run in this order (TS §4.5, rules 2 and 3).
 */
export interface MarketLayout {
  /** Stable factor IDs such as `world`, `region:europe`, `industry:software`. */
  factorIds: readonly string[];
  factorKinds: readonly FactorKind[];
  /** Minutes of the game day with factor support points: 0, all opens and closes, 1440. */
  boundaries: Int32Array;
  instrumentIds: readonly string[];
  /** Factor indices of instrument i at `i · LOADINGS_PER_INSTRUMENT + l`, in `FACTOR_KINDS` order. */
  loadingFactors: Int32Array;
  loadings: Float64Array;
  /** Index into `boundaries` of the open and close of the instrument's exchange. */
  openBoundary: Int32Array;
  closeBoundary: Int32Array;
  /** Constant `c_i = ln(start price)`. */
  logBase: Float64Array;
  idioVol: Float64Array;
  alpha: Float64Array;
  jumpIntensity: Float64Array;
  jumpMean: Float64Array;
  jumpSd: Float64Array;
  /** Dividend per instrument (TS §6.5); `null` without a rhythm. */
  dividends: readonly (InstrumentDividend | null)[];
}

export interface InstrumentDividend {
  /** Target yield at the epoch (0.03 = 3 %); 0 for companies that start to pay later (E-33). */
  yield: number;
  frequency: DividendFrequency;
  schedule: DividendSchedule;
  /** Day from which the company pays (0 for payers at the epoch). */
  startDay: number;
}

export function factorId(kind: FactorKind, member?: string): string {
  return member === undefined ? kind : `${kind}:${member}`;
}

export function createMarketLayout(world: World): MarketLayout {
  const factorIds: string[] = [factorId('world')];
  const factorKinds: FactorKind[] = ['world'];
  const add = (kind: FactorKind, member: string): void => {
    factorIds.push(factorId(kind, member));
    factorKinds.push(kind);
  };
  world.regions.forEach((region) => add('region', region.id));
  world.sectors.forEach((sector) => add('sector', sector.id));
  world.industries.forEach((industry) => add('industry', industry.id));
  factorIds.push(factorId('style'), factorId('size'));
  factorKinds.push('style', 'size');

  const boundaryMinutes = new Set<number>([0, MINUTES_PER_DAY]);
  for (const exchange of world.exchanges) {
    boundaryMinutes.add(exchange.open);
    boundaryMinutes.add(exchange.close);
  }
  const boundaries = Int32Array.from([...boundaryMinutes].sort((a, b) => a - b));

  const companies = world.companies;
  const count = companies.length;
  const layout: MarketLayout = {
    factorIds,
    factorKinds,
    boundaries,
    instrumentIds: companies.map((company) => company.id),
    loadingFactors: new Int32Array(count * LOADINGS_PER_INSTRUMENT),
    loadings: new Float64Array(count * LOADINGS_PER_INSTRUMENT),
    openBoundary: new Int32Array(count),
    closeBoundary: new Int32Array(count),
    logBase: new Float64Array(count),
    idioVol: new Float64Array(count),
    alpha: new Float64Array(count),
    jumpIntensity: new Float64Array(count),
    jumpMean: new Float64Array(count),
    jumpSd: new Float64Array(count),
    dividends: companies.map(instrumentDividend),
  };
  const factorIndex = new Map(factorIds.map((id, index) => [id, index]));
  const exchanges = new Map(world.exchanges.map((exchange) => [exchange.id, exchange]));
  companies.forEach((company, i) => {
    const exchange = exchanges.get(company.exchangeId);
    if (exchange === undefined) {
      throw new Error(`createMarketLayout: unknown exchange ${company.exchangeId}`);
    }
    layout.openBoundary[i] = boundaries.indexOf(exchange.open);
    layout.closeBoundary[i] = boundaries.indexOf(exchange.close);
    writeLoadings(layout, i, company, factorIndex);
    layout.logBase[i] = detLog(company.startPrice);
    layout.idioVol[i] = company.model.idioVol;
    layout.alpha[i] = company.model.alpha;
    layout.jumpIntensity[i] = company.model.jumpIntensity;
    layout.jumpMean[i] = company.model.jumpMean;
    layout.jumpSd[i] = company.model.jumpSd;
  });
  return layout;
}

function instrumentDividend(company: Company): InstrumentDividend | null {
  const { yield: targetYield, frequency, schedule, startDay } = company.dividend;
  if (schedule === null) {
    return null;
  }
  return { yield: targetYield, frequency, schedule, startDay };
}

function writeLoadings(
  layout: MarketLayout,
  i: number,
  company: Company,
  factorIndex: ReadonlyMap<string, number>,
): void {
  const { loadings } = company.model;
  const entries: readonly [string, number][] = [
    [factorId('world'), loadings.world],
    [factorId('region', company.regionId), loadings.region],
    [factorId('sector', company.sectorId), loadings.sector],
    [factorId('industry', company.industryId), loadings.industry],
    [factorId('style'), loadings.style],
    [factorId('size'), loadings.size],
  ];
  entries.forEach(([id, loading], l) => {
    const index = factorIndex.get(id);
    if (index === undefined) {
      throw new Error(`createMarketLayout: unknown factor ${id}`);
    }
    layout.loadingFactors[i * LOADINGS_PER_INSTRUMENT + l] = index;
    layout.loadings[i * LOADINGS_PER_INSTRUMENT + l] = loading;
  });
}
