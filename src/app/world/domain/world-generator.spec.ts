import fc from 'fast-check';

import { dayStartTick, tickToDateTime } from '@app/clock/domain/calendar-logic';
import { eurosToCents } from '@app/shared/domain/money-logic';

import { deriveSeedKey, normalizeSeed } from '@app/simulation/util/seed';

import { freeFloatMarketCap } from './company-generator';
import { DEFAULT_WORLD_CONFIG } from './default-world-config';
import { FICTIONAL_ISIN_PREFIX, isValidIsin } from './identifier-logic';
import { DIVIDENDS_PER_YEAR, REGION_IDS, SECTOR_IDS } from './models/taxonomy.model';
import { Range } from './models/world-config.model';
import { World } from './models/world.model';
import { isBlockedName } from './name-logic';
import { INDUSTRIES } from './taxonomy';
import { worldChecksum } from './world-checksum';
import { generateWorld } from './world-generator';

import { arbSeedText } from '../../../testing/arbitraries';

// Structural rules of the world (TS §5.2–§5.7) as properties over arbitrary seeds. Quantities and
// ranges come from `DEFAULT_WORLD_CONFIG`; the golden checksum lives in `golden-master.spec.ts`,
// the statistical mix of the standard world in `world-generator.calibration.spec.ts`.

const config = DEFAULT_WORLD_CONFIG;
/** Each run generates a standard world (about 10–15 ms). */
const NUM_RUNS = 8;
/** Last day of the month of an ex-date rhythm (TS §5.4). */
const LAST_SCHEDULE_DAY = 28;

function forAnyWorld(check: (world: World) => void): void {
  fc.assert(
    fc.property(arbSeedText(), (seed) => check(generateWorld(deriveSeedKey(seed)))),
    { numRuns: NUM_RUNS },
  );
}

function expectUnique(values: readonly string[]): void {
  expect(new Set(values.map((value) => value.toLowerCase())).size).toBe(values.length);
}

function expectIn(value: number | undefined, [min, max]: Range, label: string): void {
  expect(value, label).toBeGreaterThanOrEqual(min);
  expect(value, label).toBeLessThanOrEqual(max);
}

function centsRange([min, max]: Range): Range {
  return [eurosToCents(min), eurosToCents(max)];
}

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

describe('generateWorld', () => {
  describe('US-SP-03: determinism', () => {
    it('creates the same world for every spelling of a seed', () => {
      fc.assert(
        fc.property(arbSeedText(), fc.boolean(), (seed, upper) => {
          const spelled = ` ${upper ? seed.toUpperCase() : seed} `;
          fc.pre(normalizeSeed(spelled) === normalizeSeed(seed));
          const world = generateWorld(deriveSeedKey(seed));
          expect(generateWorld(deriveSeedKey(spelled))).toEqual(world);
        }),
        { numRuns: 5 },
      );
    });

    it('creates different worlds for different seeds', () => {
      fc.assert(
        fc.property(arbSeedText(), arbSeedText(), (first, second) => {
          fc.pre(normalizeSeed(first) !== normalizeSeed(second));
          expect(worldChecksum(generateWorld(deriveSeedKey(first)))).not.toBe(
            worldChecksum(generateWorld(deriveSeedKey(second))),
          );
        }),
        { numRuns: 5 },
      );
    });
  });

  describe('quantities', () => {
    it('follows the configuration of the standard world', () => {
      // Composition per bank type (TS §5.7).
      const minBanks = sum(config.banks.composition.map(({ count }) => count[0]));
      const maxBanks = sum(config.banks.composition.map(({ count }) => count[1]));
      forAnyWorld((world) => {
        expect(world.companies).toHaveLength(config.companies.count);
        expect(world.etfIssuers).toHaveLength(config.etfs.issuerCount);
        expect(world.etfs).toHaveLength(sum(config.etfs.products.map((product) => product.count)));
        expectIn(world.banks.length, [minBanks, maxBanks], 'banks');
        for (const { type, count } of config.banks.composition) {
          const ofType = world.banks.filter((bank) => bank.type === type).length;
          expectIn(ofType, count, type);
        }
      });
    });

    it('allocates the companies to regions by weight', () => {
      forAnyWorld((world) => {
        for (const regionId of REGION_IDS) {
          const expected = Math.round(
            config.companies.count * config.companies.regionWeights[regionId],
          );
          expect(world.companies.filter((company) => company.regionId === regionId)).toHaveLength(
            expected,
          );
        }
      });
    });
  });

  describe('names and identifiers', () => {
    it('has no duplicate ids, names, tickers or identifiers', () => {
      forAnyWorld((world) => {
        const instruments = [...world.companies, ...world.indices, ...world.etfs];
        expectUnique(instruments.map((instrument) => instrument.id));
        expectUnique(instruments.map((instrument) => instrument.ticker));
        expectUnique([...world.companies, ...world.etfs].map((instrument) => instrument.isin));
        expectUnique(
          [...instruments, ...world.etfIssuers, ...world.banks].map((entity) => entity.name),
        );
        expectUnique(world.banks.map((bank) => bank.id));
        expectUnique(world.etfIssuers.map((issuer) => issuer.id));
      });
    });

    it('uses fictional names and identifiers only', () => {
      forAnyWorld((world) => {
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
          expect(isValidIsin(instrument.isin), instrument.isin).toBe(true);
          expect(instrument.isin.startsWith(FICTIONAL_ISIN_PREFIX)).toBe(true);
        }
        for (const instrument of [...world.companies, ...world.indices, ...world.etfs]) {
          expect(instrument.ticker).toMatch(/^[A-Z]{2,5}$/);
        }
      });
    });
  });

  describe('companies', () => {
    it('references the taxonomy consistently', () => {
      forAnyWorld((world) => {
        const exchanges = new Map(world.exchanges.map((exchange) => [exchange.id, exchange]));
        const countries = new Map(world.countries.map((country) => [country.id, country]));
        const industries = new Map(world.industries.map((industry) => [industry.id, industry]));
        for (const company of world.companies) {
          expect(exchanges.get(company.exchangeId)?.countryId).toBe(company.countryId);
          expect(countries.get(company.countryId)?.regionId).toBe(company.regionId);
          expect(industries.get(company.industryId)?.sectorId).toBe(company.sectorId);
        }
      });
    });

    it('keeps prices, shares and market capitalisation consistent', () => {
      const { startPrice, freeFloat, sizeThresholds, savingsPlanSizes } = config.companies;
      forAnyWorld((world) => {
        for (const company of world.companies) {
          expectIn(company.startPrice, [startPrice.min, startPrice.max], 'start price');
          expect(Number.isInteger(company.sharesOutstanding)).toBe(true);
          expect(company.freeFloatShares).toBeLessThanOrEqual(company.sharesOutstanding);
          expect(company.freeFloatShares).toBeGreaterThanOrEqual(
            company.sharesOutstanding * freeFloat[0] - 1,
          );
          expect(Number.isInteger(company.marketCap)).toBe(true);
          expect(company.savingsPlanEligible).toBe(savingsPlanSizes.includes(company.size));
          // The size class follows from the market capitalisation (TS §5.4).
          const capEuros = company.sharesOutstanding * company.startPrice;
          // Rounding the start price to cents moves the capitalisation by far less than 1 %.
          const bounds: Record<typeof company.size, Range> = {
            large: [sizeThresholds.large, Number.POSITIVE_INFINITY],
            mid: [sizeThresholds.mid, sizeThresholds.large],
            small: [0, sizeThresholds.mid],
          };
          const [low, high] = bounds[company.size];
          expectIn(capEuros, [low * 0.99, high * 1.01], 'market capitalisation');
        }
      });
    });

    it('draws the model parameters from the ranges of the configuration', () => {
      const { idioVol, jumpIntensity, jumpSd, worldBeta, sizeLoading } = config.companies;
      const industries = new Map(INDUSTRIES.map((industry) => [industry.id, industry]));
      forAnyWorld((world) => {
        for (const company of world.companies) {
          const { model, size, cyclicality } = company;
          const factor = industries.get(company.industryId)?.volatilityFactor ?? Number.NaN;
          expectIn(model.idioVol / factor, idioVol[size], 'idiosyncratic volatility');
          expectIn(model.jumpIntensity, jumpIntensity[size], 'jump intensity');
          expectIn(model.jumpSd, jumpSd[size], 'jump size');
          expectIn(model.loadings.world, worldBeta[cyclicality], 'world beta');
          expectIn(model.loadings.size, sizeLoading[size], 'size loading');
        }
      });
    });

    it('derives the risk class from the full model volatility', () => {
      const { riskClassBounds, riskClassFactorVols } = config.companies;
      forAnyWorld((world) => {
        for (const { model, riskClass } of world.companies) {
          const { loadings } = model;
          const factorVariance =
            (loadings.world * riskClassFactorVols.world) ** 2 +
            (loadings.region * riskClassFactorVols.region) ** 2 +
            (loadings.sector * riskClassFactorVols.sector) ** 2 +
            (loadings.industry * riskClassFactorVols.industry) ** 2 +
            (loadings.style * riskClassFactorVols.style) ** 2 +
            (loadings.size * riskClassFactorVols.size) ** 2;
          const jumpVariance = model.jumpIntensity * (model.jumpMean ** 2 + model.jumpSd ** 2);
          const vol = Math.sqrt(factorVariance + model.idioVol ** 2 + jumpVariance);
          expect(riskClass).toBe(1 + riskClassBounds.filter((bound) => vol >= bound).length);
        }
      });
    });

    it('gives every company the frequency of its region and a yearly ex-date rhythm', () => {
      forAnyWorld((world) => {
        for (const company of world.companies) {
          const { frequency, schedule, startDay, yield: dividendYield } = company.dividend;
          const region = world.regions.find((candidate) => candidate.id === company.regionId);
          expectIn(dividendYield, [0, config.companies.maxDividendYield], 'dividend yield');
          expect(frequency).toBe(region?.dividendFrequency);
          expectIn(schedule?.firstMonth, [1, 12 / DIVIDENDS_PER_YEAR[frequency]], 'first month');
          expectIn(schedule?.day, [1, LAST_SCHEDULE_DAY], 'day');
          // Payers pay from the epoch, the others from the first day of a later month (E-33).
          if (dividendYield > 0) {
            expect(startDay).toBe(0);
          } else {
            expect(startDay).toBeGreaterThanOrEqual(0);
            expect(tickToDateTime(dayStartTick(startDay)).day).toBe(1);
          }
        }
      });
    });
  });

  describe('indices', () => {
    it('builds the world, regional, sector, small-cap and dividend indices of TS §5.5', () => {
      forAnyWorld((world) => {
        const ofKind = (kind: string): number =>
          world.indices.filter((index) => index.kind === kind).length;
        expect(ofKind('world')).toBe(1);
        expect(ofKind('region-broad')).toBe(REGION_IDS.length);
        expect(ofKind('region-leading')).toBe(REGION_IDS.length);
        // One sector index per sector with shares; a sector can stay empty (TS §5.5, 7.1a-04).
        const occupied = SECTOR_IDS.filter((sectorId) =>
          world.companies.some((company) => company.sectorId === sectorId),
        );
        expect(
          world.indices.filter((index) => index.kind === 'sector').map((index) => index.sectorId),
        ).toEqual(occupied);
        expect(ofKind('small-cap')).toBe(1);
        expect(ofKind('dividend')).toBe(1);
      });
    });

    it('leaves out the index of an empty sector (TS §5.2, §5.5)', () => {
      // `empty-13280` (AP 7.1a): no real-estate share, so 21 instead of 22 indices.
      const world = generateWorld(deriveSeedKey('empty-13280'));
      expect(world.companies.some((company) => company.sectorId === 'real-estate')).toBe(false);
      expect(world.indices).toHaveLength(21);
      expect(world.indices.some((index) => index.sectorId === 'real-estate')).toBe(false);
      expect(world.indices.filter((index) => index.kind === 'sector')).toHaveLength(
        SECTOR_IDS.length - 1,
      );
    });

    it('selects the constituents by the rule of each index', () => {
      forAnyWorld((world) => {
        const companyIds = new Set(world.companies.map((company) => company.id));
        for (const index of world.indices) {
          expect(index.constituents.length).toBeGreaterThan(0);
          expect([...index.constituents].sort()).toEqual(index.constituents);
          expect(index.constituents.every((id) => companyIds.has(id))).toBe(true);
          const members = (predicate: (company: World['companies'][number]) => boolean): string[] =>
            world.companies
              .filter(predicate)
              .map((company) => company.id)
              .sort();
          switch (index.kind) {
            case 'world':
              expect(index.constituents).toEqual(members(() => true));
              break;
            case 'region-broad':
              expect(index.constituents).toEqual(members((c) => c.regionId === index.regionId));
              break;
            case 'sector':
              expect(index.constituents).toEqual(members((c) => c.sectorId === index.sectorId));
              break;
            case 'small-cap':
              expect(index.constituents).toEqual(members((c) => c.size === 'small'));
              break;
          }
        }
      });
    });

    it('puts the largest companies of the region into the leading index', () => {
      forAnyWorld((world) => {
        for (const index of world.indices.filter((entry) => entry.kind === 'region-leading')) {
          const regionId = index.regionId;
          expect(regionId).not.toBeNull();
          const regional = world.companies.filter((company) => company.regionId === regionId);
          const members = new Set(index.constituents);
          const size = Math.min(regional.length, config.indices.leadingSize[regionId ?? 'europe']);
          expect(members.size).toBe(size);
          const smallestMember = Math.min(
            ...regional.filter((c) => members.has(c.id)).map(freeFloatMarketCap),
          );
          for (const company of regional.filter((c) => !members.has(c.id))) {
            expect(freeFloatMarketCap(company)).toBeLessThanOrEqual(smallestMember);
          }
        }
      });
    });

    it('puts the highest dividend yields into the dividend index', () => {
      forAnyWorld((world) => {
        const index = world.indices.find((entry) => entry.kind === 'dividend');
        const members = new Set(index?.constituents);
        expect(members.size).toBe(config.indices.dividendSize);
        const lowestMember = Math.min(
          ...world.companies.filter((c) => members.has(c.id)).map((c) => c.dividend.yield),
        );
        expect(lowestMember).toBeGreaterThan(0);
        for (const company of world.companies.filter((c) => !members.has(c.id))) {
          expect(company.dividend.yield).toBeLessThanOrEqual(lowestMember);
        }
      });
    });
  });

  describe('ETFs', () => {
    it('track existing indices with TERs from the ranges of their products', () => {
      const terRange: Range = [
        Math.min(...config.etfs.products.map((product) => product.ter[0])),
        Math.max(...config.etfs.products.map((product) => product.ter[1])),
      ];
      forAnyWorld((world) => {
        const indexIds = new Set(world.indices.map((index) => index.id));
        const issuerIds = new Set(world.etfIssuers.map((issuer) => issuer.id));
        const exchangeIds = new Set(world.exchanges.map((exchange) => exchange.id));
        for (const etf of world.etfs) {
          expect(indexIds.has(etf.indexId)).toBe(true);
          expect(issuerIds.has(etf.issuerId)).toBe(true);
          expect(exchangeIds.has(etf.exchangeId)).toBe(true);
          expectIn(etf.ter, terRange, 'TER');
          expect(etf.savingsPlanEligible).toBe(true);
        }
      });
    });

    it('come from different issuers per index (TS §5.6)', () => {
      forAnyWorld((world) => {
        for (const index of world.indices) {
          const issuers = world.etfs
            .filter((etf) => etf.indexId === index.id)
            .map((etf) => etf.issuerId);
          expect(new Set(issuers).size).toBe(issuers.length);
        }
      });
    });

    it('distribute when their product always distributes', () => {
      const alwaysDistributing = config.etfs.products
        .filter((product) => product.distributingShare === 1)
        .map((product) => product.kind);
      forAnyWorld((world) => {
        for (const etf of world.etfs) {
          const kind = world.indices.find((index) => index.id === etf.indexId)?.kind;
          if (kind !== undefined && alwaysDistributing.includes(kind)) {
            expect(etf.distribution.kind).toBe('distributing');
          }
        }
      });
    });

    it('get a start price in cents and the distributing ones an ex-date rhythm', () => {
      const { startPrice } = config.etfs;
      forAnyWorld((world) => {
        for (const etf of world.etfs) {
          expectIn(etf.startPrice, [startPrice.min, startPrice.max], 'start price');
          expect(eurosToCents(etf.startPrice) / 100).toBe(etf.startPrice);
          if (etf.distribution.kind === 'distributing') {
            const { frequency, schedule } = etf.distribution;
            expectIn(schedule.firstMonth, [1, 12 / DIVIDENDS_PER_YEAR[frequency]], 'first month');
            expectIn(schedule.day, [1, LAST_SCHEDULE_DAY], 'day');
          }
        }
      });
    });
  });

  describe('US-BK-01: banks', () => {
    it('draws branch bank conditions from the ranges of the configuration', () => {
      const ranges = config.banks.branch;
      forAnyWorld((world) => {
        for (const { conditions } of world.banks.filter((bank) => bank.type === 'branch')) {
          const { currentAccount, savingsAccount, depot } = conditions;
          expectIn(currentAccount?.monthlyFee, centsRange(ranges.monthlyFee), 'monthly fee');
          expectIn(currentAccount?.overdraft.rate, ranges.overdraftRate, 'overdraft rate');
          expectIn(
            currentAccount?.overdraft.toleratedSurcharge,
            ranges.toleratedSurcharge,
            'tolerated surcharge',
          );
          expectIn(savingsAccount?.rate, ranges.savingsRate, 'savings rate');
          expect(depot.custodyFee.kind).toBe('percent-pa');
          if (depot.custodyFee.kind === 'percent-pa') {
            expectIn(depot.custodyFee.rate, ranges.custodyRate, 'custody rate');
            expectIn(depot.custodyFee.min, centsRange(ranges.custodyMin), 'custody minimum');
          }
          expect(depot.orderFee).toEqual({
            kind: 'percent',
            rate: ranges.orderRate,
            min: eurosToCents(ranges.orderMin),
            max: eurosToCents(ranges.orderMax),
          });
          expect(depot.savingsPlanFee.kind).toBe('percent');
          expect(depot.venue).toBe('exchange');
          expectIn(depot.clearingAccountDebitRate, ranges.clearingDebitRate, 'debit rate');
        }
      });
    });

    it('draws direct bank conditions from the ranges of the configuration', () => {
      const ranges = config.banks.direct;
      forAnyWorld((world) => {
        for (const { conditions } of world.banks.filter((bank) => bank.type === 'direct')) {
          const { currentAccount, savingsAccount, depot } = conditions;
          expectIn(currentAccount?.monthlyFee, centsRange(ranges.monthlyFee), 'monthly fee');
          expect(currentAccount?.feeWaiver).toEqual({
            minMonthlyDeposits: eurosToCents(ranges.feeWaiverMinDeposits),
          });
          expectIn(currentAccount?.overdraft.rate, ranges.overdraftRate, 'overdraft rate');
          expectIn(savingsAccount?.rate, ranges.savingsRate, 'savings rate');
          expect(depot.custodyFee).toEqual({ kind: 'none' });
          expect(depot.orderFee.kind).toBe('flat-plus-percent');
          expectIn(depot.clearingAccountDebitRate, ranges.clearingDebitRate, 'debit rate');
        }
      });
    });

    it('gives banks of the same type different conditions', () => {
      forAnyWorld((world) => {
        for (const type of ['branch', 'direct'] as const) {
          const conditions = world.banks
            .filter((bank) => bank.type === type)
            .map(({ conditions: { currentAccount, savingsAccount, depot } }) =>
              JSON.stringify([
                currentAccount?.monthlyFee,
                currentAccount?.overdraft.rate,
                savingsAccount?.rate,
                depot.orderFee,
              ]),
            );
          expect(conditions.length, type).toBeGreaterThan(1);
          expect(new Set(conditions).size, type).toBe(conditions.length);
        }
      });
    });

    it('gives brokers depots only, with the venue of their type', () => {
      forAnyWorld((world) => {
        for (const bank of world.banks.filter((entry) => entry.type.endsWith('broker'))) {
          const { currentAccount, savingsAccount, depot } = bank.conditions;
          expect(currentAccount).toBeNull();
          expect(savingsAccount).toBeNull();
          expect(depot.custodyFee).toEqual({ kind: 'none' });
          if (bank.type === 'neo-broker') {
            const ranges = config.banks.neoBroker;
            expect(depot.venue).toBe('market-maker');
            expect(depot.fractionalShares).toBe(true);
            expectIn(depot.spreadMarkup, ranges.spreadMarkup, 'spread mark-up');
            expectIn(depot.clearingAccountRate, ranges.clearingRate, 'clearing rate');
            expectIn(depot.clearingAccountDebitRate, ranges.clearingDebitRate, 'debit rate');
            expect(depot.savingsPlanFee).toEqual({ kind: 'free' });
          } else {
            expect(depot.venue).toBe('exchange');
            expect(depot.orderFee.kind).toBe('flat');
            expectIn(
              depot.clearingAccountDebitRate,
              config.banks.onlineBroker.clearingDebitRate,
              'debit rate',
            );
          }
        }
      });
    });
  });
});
