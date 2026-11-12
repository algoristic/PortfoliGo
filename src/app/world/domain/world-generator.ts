import { createStream } from '@app/simulation/util/random-stream';

import { SeedKey } from '@app/simulation/util/seed';

import { generateBanks } from './bank-generator';
import { generateCompanies } from './company-generator';
import { DEFAULT_WORLD_CONFIG } from './default-world-config';
import { assignDividendSchedules } from './dividend-schedule-generator';
import { generateEtfIssuers, generateEtfs } from './etf-generator';
import { assignEtfTerms } from './etf-terms-generator';
import { createRegistries } from './generator.utils';
import { generateIndices } from './index-generator';
import { WorldConfig } from './models/world-config.model';
import { World } from './models/world.model';
import { COUNTRIES, EXCHANGES, INDUSTRIES, REGIONS, SECTORS } from './taxonomy';

/**
 * Generates the world for a seed (TS §5.1). Every stage draws from its own stream, so changing
 * the banks does not move the companies; names, tickers and identifiers are unique across stages.
 */
export function generateWorld(seedKey: SeedKey, config: WorldConfig = DEFAULT_WORLD_CONFIG): World {
  const registries = createRegistries();
  const drafts = generateCompanies(
    createStream(seedKey, 'world/companies'),
    config.companies,
    registries,
  );
  const indices = generateIndices(
    createStream(seedKey, 'world/indices'),
    drafts,
    config.indices,
    registries,
  );
  const etfStream = createStream(seedKey, 'world/etfs');
  const issuers = generateEtfIssuers(etfStream, config.etfs, registries);
  const etfDrafts = generateEtfs(etfStream, issuers, indices, config.etfs, registries);
  const banks = generateBanks(createStream(seedKey, 'world/banks'), config.banks, registries);
  const companies = assignDividendSchedules(createStream(seedKey, 'world/dividends'), drafts);
  const etfs = assignEtfTerms(createStream(seedKey, 'world/etf-terms'), etfDrafts, config.etfs);
  return {
    regions: REGIONS,
    countries: COUNTRIES,
    exchanges: EXCHANGES,
    sectors: SECTORS,
    industries: INDUSTRIES,
    companies,
    indices,
    etfIssuers: issuers.map(({ issuer }) => issuer),
    etfs,
    banks,
  };
}
