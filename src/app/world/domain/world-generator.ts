import { generateBanks } from './bank-generator';
import { generateCompanies } from './company-generator';
import { DEFAULT_WORLD_CONFIG } from './default-world-config';
import { generateEtfIssuers, generateEtfs } from './etf-generator';
import { createRegistries } from './generator.utils';
import { generateIndices } from './index-generator';
import { WorldConfig } from './models/world-config.model';
import { World } from './models/world.model';
import { COUNTRIES, EXCHANGES, INDUSTRIES, REGIONS, SECTORS } from './taxonomy';

import { createStream } from '../../simulation/util/random-stream';
import { SeedKey } from '../../simulation/util/seed';

/**
 * Generates the world for a seed (TS §5.1). Every stage draws from its own stream, so changing
 * the banks does not move the companies; names, tickers and identifiers are unique across stages.
 */
export function generateWorld(seedKey: SeedKey, config: WorldConfig = DEFAULT_WORLD_CONFIG): World {
  const registries = createRegistries();
  const companies = generateCompanies(
    createStream(seedKey, 'world/companies'),
    config.companies,
    registries,
  );
  const indices = generateIndices(
    createStream(seedKey, 'world/indices'),
    companies,
    config.indices,
    registries,
  );
  const etfStream = createStream(seedKey, 'world/etfs');
  const issuers = generateEtfIssuers(etfStream, config.etfs, registries);
  const etfs = generateEtfs(etfStream, issuers, indices, config.etfs, registries);
  const banks = generateBanks(createStream(seedKey, 'world/banks'), config.banks, registries);
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
