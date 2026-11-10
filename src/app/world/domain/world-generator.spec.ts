import { freeFloatMarketCap } from './company-generator';
import { DEFAULT_WORLD_CONFIG } from './default-world-config';
import { isValidIsin } from './identifier-logic';
import { Company } from './models/company.model';
import { REGION_IDS, SECTOR_IDS } from './models/taxonomy.model';
import { World } from './models/world.model';
import { isBlockedName } from './name-logic';
import { worldChecksum } from './world-checksum';
import { generateWorld } from './world-generator';

import { deriveSeedKey } from '../../simulation/util/seed';

/** Changes when the world for existing seeds changes; then `simVersion` must be raised (TS §15). */
const GOLDEN_1_CHECKSUM = '3af5e3bdb655573d909560fa845d6d4e';

const SEEDS = Array.from({ length: 20 }, (_value, index) => `world-test-${index}`);
const worlds: readonly World[] = SEEDS.map((seed) => generateWorld(deriveSeedKey(seed)));
const allCompanies: readonly Company[] = worlds.flatMap((world) => world.companies);

function share<T>(items: readonly T[], predicate: (item: T) => boolean): number {
  return items.filter(predicate).length / items.length;
}

function expectUnique(values: readonly string[]): void {
  expect(new Set(values.map((value) => value.toLowerCase())).size).toBe(values.length);
}

describe('generateWorld', () => {
  describe('determinism', () => {
    it('creates an identical world for the same seed', () => {
      const first = generateWorld(deriveSeedKey('golden-1'));
      const second = generateWorld(deriveSeedKey('  Golden-1 '));
      expect(second).toEqual(first);
      expect(worldChecksum(first)).toBe(worldChecksum(second));
    });

    it('matches the golden checksum', () => {
      expect(worldChecksum(generateWorld(deriveSeedKey('golden-1')))).toBe(GOLDEN_1_CHECKSUM);
    });

    it('creates different worlds for different seeds', () => {
      expect(new Set(worlds.map(worldChecksum)).size).toBe(worlds.length);
    });
  });

  describe('quantities', () => {
    it('follows the configuration of the standard world', () => {
      for (const world of worlds) {
        expect(world.companies).toHaveLength(DEFAULT_WORLD_CONFIG.companies.count);
        expect(world.indices).toHaveLength(22);
        expect(world.etfIssuers).toHaveLength(DEFAULT_WORLD_CONFIG.etfs.issuerCount);
        expect(world.etfs).toHaveLength(30);
        expect(world.banks.length).toBeGreaterThanOrEqual(6);
        expect(world.banks.length).toBeLessThanOrEqual(8);
      }
    });

    it('allocates companies to regions by weight', () => {
      const world = worlds[0];
      for (const regionId of REGION_IDS) {
        const expected =
          DEFAULT_WORLD_CONFIG.companies.count *
          DEFAULT_WORLD_CONFIG.companies.regionWeights[regionId];
        expect(world.companies.filter((company) => company.regionId === regionId)).toHaveLength(
          expected,
        );
      }
    });
  });

  describe('uniqueness and references', () => {
    it('has no duplicate ids, names, tickers or identifiers', () => {
      for (const world of worlds) {
        const instruments = [...world.companies, ...world.indices, ...world.etfs];
        expectUnique(instruments.map((instrument) => instrument.id));
        expectUnique(instruments.map((instrument) => instrument.ticker));
        expectUnique([...world.companies, ...world.etfs].map((instrument) => instrument.isin));
        expectUnique(
          [...instruments, ...world.etfIssuers, ...world.banks].map((entity) => entity.name),
        );
        expectUnique(world.banks.map((bank) => bank.id));
        expectUnique(world.etfIssuers.map((issuer) => issuer.id));
      }
    });

    it('uses fictional names and identifiers only', () => {
      for (const world of worlds) {
        const entities = [
          ...world.companies,
          ...world.indices,
          ...world.etfs,
          ...world.etfIssuers,
          ...world.banks,
        ];
        for (const entity of entities) {
          expect(isBlockedName(entity.name), entity.name).toBe(false);
        }
        for (const instrument of [...world.companies, ...world.etfs]) {
          expect(isValidIsin(instrument.isin)).toBe(true);
          expect(instrument.isin.startsWith('QP')).toBe(true);
        }
        for (const instrument of [...world.companies, ...world.indices, ...world.etfs]) {
          expect(instrument.ticker).toMatch(/^[A-Z]{2,5}$/);
        }
      }
    });

    it('references existing entries', () => {
      for (const world of worlds) {
        const exchanges = new Map(world.exchanges.map((exchange) => [exchange.id, exchange]));
        const countries = new Map(world.countries.map((country) => [country.id, country]));
        const industries = new Map(world.industries.map((industry) => [industry.id, industry]));
        const companyIds = new Set(world.companies.map((company) => company.id));
        const indexIds = new Set(world.indices.map((index) => index.id));
        const issuerIds = new Set(world.etfIssuers.map((issuer) => issuer.id));
        for (const company of world.companies) {
          expect(exchanges.get(company.exchangeId)?.countryId).toBe(company.countryId);
          expect(countries.get(company.countryId)?.regionId).toBe(company.regionId);
          expect(industries.get(company.industryId)?.sectorId).toBe(company.sectorId);
        }
        for (const index of world.indices) {
          expect(index.constituents.length).toBeGreaterThan(0);
          expect([...index.constituents].sort()).toEqual(index.constituents);
          for (const id of index.constituents) {
            expect(companyIds.has(id)).toBe(true);
          }
        }
        for (const etf of world.etfs) {
          expect(indexIds.has(etf.indexId)).toBe(true);
          expect(issuerIds.has(etf.issuerId)).toBe(true);
          expect(exchanges.has(etf.exchangeId)).toBe(true);
        }
      }
    });
  });

  describe('indices', () => {
    it('builds the world, regional, sector, small-cap and dividend indices', () => {
      for (const world of worlds) {
        const byKind = (kind: string): number =>
          world.indices.filter((index) => index.kind === kind).length;
        expect(byKind('world')).toBe(1);
        expect(byKind('region-broad')).toBe(4);
        expect(byKind('region-leading')).toBe(4);
        expect(byKind('sector')).toBe(SECTOR_IDS.length);
        expect(byKind('small-cap')).toBe(1);
        expect(byKind('dividend')).toBe(1);

        const worldIndex = world.indices.find((index) => index.kind === 'world');
        expect(worldIndex?.constituents).toHaveLength(world.companies.length);
      }
    });

    it('puts the largest companies of the region into the leading index', () => {
      for (const world of worlds) {
        for (const index of world.indices.filter((entry) => entry.kind === 'region-leading')) {
          const regionId = index.regionId;
          expect(regionId).not.toBeNull();
          const regional = world.companies.filter((company) => company.regionId === regionId);
          const members = new Set(index.constituents);
          const size = Math.min(
            regional.length,
            DEFAULT_WORLD_CONFIG.indices.leadingSize[regionId ?? 'europe'],
          );
          expect(members.size).toBe(size);
          const smallestMember = Math.min(
            ...regional.filter((c) => members.has(c.id)).map(freeFloatMarketCap),
          );
          for (const company of regional.filter((c) => !members.has(c.id))) {
            expect(freeFloatMarketCap(company)).toBeLessThanOrEqual(smallestMember);
          }
        }
      }
    });
  });

  describe('distributions', () => {
    it('mixes large, mid and small caps', () => {
      expect(share(allCompanies, (company) => company.size === 'large')).toBeGreaterThan(0.15);
      expect(share(allCompanies, (company) => company.size === 'large')).toBeLessThan(0.4);
      expect(share(allCompanies, (company) => company.size === 'mid')).toBeGreaterThan(0.25);
      expect(share(allCompanies, (company) => company.size === 'small')).toBeGreaterThan(0.2);
    });

    it('mixes styles, cyclicalities and risk classes', () => {
      for (const style of ['value', 'blend', 'growth']) {
        expect(share(allCompanies, (company) => company.style === style)).toBeGreaterThan(0.15);
      }
      for (const cyclicality of ['defensive', 'neutral', 'cyclical']) {
        expect(share(allCompanies, (c) => c.cyclicality === cyclicality)).toBeGreaterThan(0.15);
      }
      for (const riskClass of [1, 2, 3, 4, 5]) {
        expect(share(allCompanies, (c) => c.riskClass === riskClass)).toBeGreaterThan(0.02);
      }
    });

    it('keeps prices, shares and market capitalisation consistent', () => {
      for (const company of allCompanies) {
        expect(company.startPrice).toBeGreaterThanOrEqual(5);
        expect(company.startPrice).toBeLessThanOrEqual(500);
        expect(Number.isInteger(company.sharesOutstanding)).toBe(true);
        expect(company.freeFloatShares).toBeLessThanOrEqual(company.sharesOutstanding);
        expect(company.freeFloatShares).toBeGreaterThanOrEqual(company.sharesOutstanding * 0.5 - 1);
        expect(Number.isInteger(company.marketCap)).toBe(true);
        expect(company.savingsPlanEligible).toBe(company.size === 'large');
      }
    });

    it('draws model parameters inside the start ranges', () => {
      for (const { model, size } of allCompanies) {
        expect(model.idioVol).toBeGreaterThanOrEqual(0.1);
        expect(model.idioVol).toBeLessThanOrEqual(0.75);
        expect(model.jumpIntensity).toBeGreaterThanOrEqual(2);
        expect(model.jumpIntensity).toBeLessThanOrEqual(6);
        expect(model.loadings.world).toBeGreaterThanOrEqual(0.6);
        expect(model.loadings.world).toBeLessThanOrEqual(1.4);
        expect(model.loadings.size > 0).toBe(size !== 'large');
      }
    });

    it('produces dividend yields of 0–7 % and 2–3 % in the world index', () => {
      for (const company of allCompanies) {
        expect(company.dividend.yield).toBeGreaterThanOrEqual(0);
        expect(company.dividend.yield).toBeLessThanOrEqual(0.07);
        expect(company.dividend.frequency === null).toBe(company.dividend.yield === 0);
      }
      for (const world of worlds) {
        let weighted = 0;
        let total = 0;
        for (const company of world.companies) {
          weighted += freeFloatMarketCap(company) * company.dividend.yield;
          total += freeFloatMarketCap(company);
        }
        expect(weighted / total).toBeGreaterThan(0.015);
        expect(weighted / total).toBeLessThan(0.035);
      }
      expect(share(allCompanies, (company) => company.dividend.yield === 0)).toBeGreaterThan(0.1);
    });

    it('offers several ETFs per broad index with TERs of 0.05–0.65 %', () => {
      for (const world of worlds) {
        for (const etf of world.etfs) {
          expect(etf.ter).toBeGreaterThanOrEqual(0.0005);
          expect(etf.ter).toBeLessThanOrEqual(0.0065);
          expect(etf.savingsPlanEligible).toBe(true);
        }
        const worldIndex = world.indices.find((index) => index.kind === 'world');
        const worldEtfs = world.etfs.filter((etf) => etf.indexId === worldIndex?.id);
        expect(new Set(worldEtfs.map((etf) => etf.issuerId)).size).toBe(worldEtfs.length);
        const dividendIndex = world.indices.find((index) => index.kind === 'dividend');
        for (const etf of world.etfs.filter((entry) => entry.indexId === dividendIndex?.id)) {
          expect(etf.distribution.kind).toBe('distributing');
        }
      }
      const etfs = worlds.flatMap((world) => world.etfs);
      expect(share(etfs, (etf) => etf.distribution.kind === 'distributing')).toBeGreaterThan(0.2);
      expect(share(etfs, (etf) => etf.distribution.kind === 'accumulating')).toBeGreaterThan(0.4);
    });
  });

  describe('banks', () => {
    const banks = worlds.flatMap((world) => world.banks);

    it('always includes branch banks for the house bank and every bank type', () => {
      for (const world of worlds) {
        for (const type of ['branch', 'direct', 'online-broker', 'neo-broker']) {
          expect(world.banks.some((bank) => bank.type === type)).toBe(true);
        }
      }
    });

    it('draws branch bank conditions inside the ranges of TS §5.7', () => {
      for (const { conditions } of banks.filter((bank) => bank.type === 'branch')) {
        const { currentAccount, savingsAccount, depot } = conditions;
        expect(currentAccount?.monthlyFee).toBeGreaterThanOrEqual(600);
        expect(currentAccount?.monthlyFee).toBeLessThanOrEqual(1200);
        expect(currentAccount?.overdraft.rate).toBeGreaterThanOrEqual(0.1);
        expect(currentAccount?.overdraft.rate).toBeLessThanOrEqual(0.14);
        expect(currentAccount?.overdraft.toleratedSurcharge).toBeGreaterThanOrEqual(0.03);
        expect(currentAccount?.overdraft.toleratedSurcharge).toBeLessThanOrEqual(0.05);
        expect(savingsAccount?.rate).toBeLessThanOrEqual(0.005);
        expect(depot.custodyFee.kind).toBe('percent-pa');
        if (depot.custodyFee.kind === 'percent-pa') {
          expect(depot.custodyFee.rate).toBeGreaterThanOrEqual(0.001);
          expect(depot.custodyFee.rate).toBeLessThanOrEqual(0.0025);
          expect(depot.custodyFee.min).toBeGreaterThanOrEqual(2500);
          expect(depot.custodyFee.min).toBeLessThanOrEqual(4500);
        }
        expect(depot.orderFee).toEqual({ kind: 'percent', rate: 0.0025, min: 1000, max: 6000 });
        expect(depot.savingsPlanFee.kind).toBe('percent');
        expect(depot.venue).toBe('exchange');
      }
    });

    it('draws direct bank conditions inside the ranges of TS §5.7', () => {
      for (const { conditions } of banks.filter((bank) => bank.type === 'direct')) {
        const { currentAccount, savingsAccount, depot } = conditions;
        expect(currentAccount?.monthlyFee).toBeGreaterThanOrEqual(400);
        expect(currentAccount?.monthlyFee).toBeLessThanOrEqual(600);
        expect(currentAccount?.feeWaiver).toEqual({ minMonthlyDeposits: 70000 });
        expect(currentAccount?.overdraft.rate).toBeGreaterThanOrEqual(0.07);
        expect(currentAccount?.overdraft.rate).toBeLessThanOrEqual(0.1);
        expect(savingsAccount?.rate).toBeGreaterThanOrEqual(0.015);
        expect(savingsAccount?.rate).toBeLessThanOrEqual(0.03);
        expect(depot.custodyFee).toEqual({ kind: 'none' });
        expect(depot.orderFee.kind).toBe('flat-plus-percent');
      }
    });

    it('gives brokers depots only, with the venue of their type', () => {
      for (const bank of banks.filter((entry) => entry.type.endsWith('broker'))) {
        const { currentAccount, savingsAccount, depot } = bank.conditions;
        expect(currentAccount).toBeNull();
        expect(savingsAccount).toBeNull();
        expect(depot.custodyFee).toEqual({ kind: 'none' });
        if (bank.type === 'neo-broker') {
          expect(depot.venue).toBe('market-maker');
          expect(depot.fractionalShares).toBe(true);
          expect(depot.spreadMarkup).toBeGreaterThanOrEqual(0.0005);
          expect(depot.spreadMarkup).toBeLessThanOrEqual(0.002);
          expect(depot.clearingAccountRate).toBeGreaterThanOrEqual(0.01);
          expect(depot.clearingAccountRate).toBeLessThanOrEqual(0.025);
          expect(depot.savingsPlanFee).toEqual({ kind: 'free' });
        } else {
          expect(depot.venue).toBe('exchange');
          expect(depot.orderFee.kind).toBe('flat');
        }
      }
    });

    it('charges a debit rate on negative clearing accounts at every bank', () => {
      for (const bank of banks) {
        expect(bank.conditions.depot.clearingAccountDebitRate).toBeGreaterThan(0.05);
      }
    });
  });

  describe('performance', () => {
    it('generates the standard world in under 200 ms', () => {
      generateWorld(deriveSeedKey('warm-up'));
      const start = performance.now();
      generateWorld(deriveSeedKey('performance'));
      expect(performance.now() - start).toBeLessThan(200);
    });
  });
});
