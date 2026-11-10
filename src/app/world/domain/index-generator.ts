import { freeFloatMarketCap } from './company-generator';
import { GenerationRegistries } from './generator.utils';
import { formatId, nextTicker } from './identifier-logic';
import { Company } from './models/company.model';
import { IndexKind, MarketIndex } from './models/market-index.model';
import { REGION_IDS, RegionId, SECTOR_IDS, SectorId } from './models/taxonomy.model';
import { IndexConfig } from './models/world-config.model';
import { isBlockedName } from './name-logic';
import { REGION_INDEX_WORDS, SECTOR_INDEX_WORDS } from './names/name-parts';

import { RandomStream } from '../../simulation/util/random-stream';

const MAX_FAMILY_ATTEMPTS = 100;

interface IndexDraft {
  name: string;
  kind: IndexKind;
  regionId: RegionId | null;
  sectorId: SectorId | null;
  members: readonly Company[];
}

function byId(a: Company, b: Company): number {
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** The `count` largest companies by free-float market capitalisation (ties by id). */
function largest(companies: readonly Company[], count: number): Company[] {
  return [...companies]
    .sort((a, b) => freeFloatMarketCap(b) - freeFloatMarketCap(a) || byId(a, b))
    .slice(0, count);
}

function highestYield(companies: readonly Company[], count: number): Company[] {
  return companies
    .filter((company) => company.dividend.yield > 0)
    .sort((a, b) => b.dividend.yield - a.dividend.yield || byId(a, b))
    .slice(0, count);
}

/** Indices of one provider family ("Arvon World 200") and its leading indices ("Velix 40"). */
function draftIndices(
  family: string,
  leadingNames: Readonly<Record<RegionId, string>>,
  companies: readonly Company[],
  config: IndexConfig,
): IndexDraft[] {
  const drafts: IndexDraft[] = [];
  const add = (
    name: (count: number) => string,
    kind: IndexKind,
    members: readonly Company[],
    regionId: RegionId | null = null,
    sectorId: SectorId | null = null,
  ): void => {
    if (members.length > 0) {
      drafts.push({ name: name(members.length), kind, regionId, sectorId, members });
    }
  };

  add((n) => `${family} World ${n}`, 'world', companies);
  for (const regionId of REGION_IDS) {
    const regional = companies.filter((company) => company.regionId === regionId);
    add(
      (n) => `${family} ${REGION_INDEX_WORDS[regionId]} ${n}`,
      'region-broad',
      regional,
      regionId,
    );
    add(
      (n) => `${leadingNames[regionId]} ${n}`,
      'region-leading',
      largest(regional, config.leadingSize[regionId]),
      regionId,
    );
  }
  for (const sectorId of SECTOR_IDS) {
    const members = companies.filter((company) => company.sectorId === sectorId);
    add(() => `${family} World ${SECTOR_INDEX_WORDS[sectorId]}`, 'sector', members, null, sectorId);
  }
  add(
    (n) => `${family} World Small Cap ${n}`,
    'small-cap',
    companies.filter((company) => company.size === 'small'),
  );
  add(
    (n) => `${family} Global Dividend ${n}`,
    'dividend',
    highestYield(companies, config.dividendSize),
  );
  return drafts;
}

export function generateIndices(
  rng: RandomStream,
  companies: readonly Company[],
  config: IndexConfig,
  registries: GenerationRegistries,
): MarketIndex[] {
  const leadingNames = {} as Record<RegionId, string>;
  for (const regionId of REGION_IDS) {
    leadingNames[regionId] = registries.names.next(rng, (core) => core).core;
  }
  let drafts: IndexDraft[] | null = null;
  for (let attempt = 0; attempt < MAX_FAMILY_ATTEMPTS && !drafts; attempt++) {
    const family = registries.names.next(rng, (core) => core).core;
    const candidate = draftIndices(family, leadingNames, companies, config);
    if (candidate.every((draft) => !isBlockedName(draft.name))) {
      drafts = candidate;
    }
  }
  if (!drafts) {
    throw new Error('generateIndices: no index family name found');
  }
  return drafts.map((draft, index) => {
    registries.names.claim(draft.name);
    return {
      id: formatId('idx', index + 1),
      name: draft.name,
      ticker: nextTicker(rng, draft.name, registries.tickers),
      kind: draft.kind,
      regionId: draft.regionId,
      sectorId: draft.sectorId,
      constituents: draft.members.map((company) => company.id).sort(),
      weighting: 'free-float-market-cap',
      capWeight: config.capWeight[draft.kind],
      baseValue: config.baseValue,
    };
  });
}
