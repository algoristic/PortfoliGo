import { eurosToCents } from '@app/shared/domain/money-logic';

import { pick, shuffle, weightedIndex } from '@app/simulation/util/distributions';

import { RandomStream } from '@app/simulation/util/random-stream';

import { GenerationRegistries, lognormalIn, roundToGrid, uniformIn } from './generator.utils';
import { formatId, nextIsin, nextTicker } from './identifier-logic';
import { Etf, ETF_REPLICATIONS, EtfDistributionFrequency, EtfIssuer } from './models/etf.model';
import { MarketIndex } from './models/market-index.model';
import { EtfConfig, EtfProductConfig } from './models/world-config.model';
import { fillPattern } from './name-logic';
import { ISSUER_PATTERNS } from './names/name-parts';

/** TER in steps of 0.01 percentage points. */
const TER_STEPS_PER_UNIT = 10_000;
const MAX_SHARE_CLASSES = 9;

/** Distribution without its ex-date rhythm, which `assignEtfTerms` draws from its own stream. */
export type EtfDistributionDraft =
  { kind: 'accumulating' } | { kind: 'distributing'; frequency: EtfDistributionFrequency };

/** ETF before `assignEtfTerms` adds the start price and the ex-date rhythm. */
export type EtfDraft = Omit<Etf, 'distribution' | 'startPrice'> & {
  distribution: EtfDistributionDraft;
};

export interface IssuerDraft {
  issuer: EtfIssuer;
  /** Brand used in product names ("Velora" for "Velora Asset Management"). */
  brand: string;
}

function findIndex(
  indices: readonly MarketIndex[],
  product: EtfProductConfig,
): MarketIndex | undefined {
  return indices.find(
    (index) =>
      index.kind === product.kind &&
      index.regionId === (product.regionId ?? null) &&
      index.sectorId === (product.sectorId ?? null),
  );
}

function shareClassName(distribution: EtfDistributionDraft): string {
  return distribution.kind === 'accumulating' ? 'Acc' : 'Dist';
}

export function generateEtfIssuers(
  rng: RandomStream,
  config: EtfConfig,
  registries: GenerationRegistries,
): IssuerDraft[] {
  const drafts: IssuerDraft[] = [];
  for (let i = 0; i < config.issuerCount; i++) {
    const pattern = pick(rng, ISSUER_PATTERNS);
    const { core, name } = registries.names.next(rng, (brand) => fillPattern(pattern, brand));
    drafts.push({ issuer: { id: formatId('iss', i + 1), name }, brand: core });
  }
  return drafts;
}

export function generateEtfs(
  rng: RandomStream,
  issuers: readonly IssuerDraft[],
  indices: readonly MarketIndex[],
  config: EtfConfig,
  registries: GenerationRegistries,
): EtfDraft[] {
  const replicationWeights = ETF_REPLICATIONS.map((kind) => config.replicationWeights[kind]);
  const etfs: EtfDraft[] = [];
  for (const product of config.products) {
    const index = findIndex(indices, product);
    if (!index) {
      continue;
    }
    // Different issuers per index, so the cost comparison between them is meaningful.
    const order = shuffle(
      rng,
      issuers.map((_issuer, position) => position),
    );
    for (let i = 0; i < product.count; i++) {
      const { issuer, brand } = issuers[order[i % order.length]];
      const distribution: EtfDistributionDraft =
        rng.nextFloat53() < product.distributingShare
          ? {
              kind: 'distributing',
              frequency: rng.nextFloat53() < config.quarterlyShare ? 'quarterly' : 'annual',
            }
          : { kind: 'accumulating' };
      const baseName = `${brand} ${index.name} UCITS ETF`;
      let name = `${baseName} ${shareClassName(distribution)}`;
      for (let shareClass = 2; !registries.names.claim(name); shareClass++) {
        if (shareClass > MAX_SHARE_CLASSES) {
          throw new Error(`generateEtfs: no free name for ${baseName}`);
        }
        name = `${baseName} ${shareClass} ${shareClassName(distribution)}`;
      }
      etfs.push({
        id: formatId('etf', etfs.length + 1),
        name,
        ticker: nextTicker(rng, name, registries.tickers),
        isin: nextIsin(rng, registries.isins),
        issuerId: issuer.id,
        indexId: index.id,
        exchangeId: config.exchangeId,
        distribution,
        ter: roundToGrid(uniformIn(rng, product.ter), TER_STEPS_PER_UNIT),
        replication: ETF_REPLICATIONS[weightedIndex(rng, replicationWeights)],
        fundVolume: eurosToCents(lognormalIn(rng, config.fundVolume)),
        savingsPlanEligible: true,
      });
    }
  }
  return etfs;
}
