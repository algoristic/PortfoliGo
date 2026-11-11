import {
  allocateByLargestRemainder,
  GenerationRegistries,
  lognormalIn,
  roundToGrid,
  uniformIn,
} from './generator.utils';
import { formatId, nextIsin, nextTicker } from './identifier-logic';
import { Company, PROFILE_TEMPLATES } from './models/company.model';
import {
  Country,
  CYCLICALITIES,
  Cyclicality,
  RiskClass,
  SizeClass,
  Style,
} from './models/taxonomy.model';
import { CompanyConfig } from './models/world-config.model';
import { COUNTRIES, EXCHANGES, INDUSTRIES, REGIONS } from './taxonomy';

import { eurosToCents, roundHalfAwayFromZero } from '../../shared/domain/money-logic';
import {
  normal,
  pick,
  shuffle,
  uniformInt,
  weightedIndex,
} from '../../simulation/util/distributions';
import { RandomStream } from '../../simulation/util/random-stream';

const STYLE_THRESHOLD = 1 / 3;
/** Share of names with an industry word ("Velora Micro AG"); the rest is "Velora AG". */
const INDUSTRY_WORD_SHARE = 0.7;
/** Weights of `PROFILE_TEMPLATES` per size class. */
const PROFILE_WEIGHTS: Readonly<Record<SizeClass, readonly number[]>> = {
  large: [5, 2, 1, 1],
  mid: [2, 3, 3, 2],
  small: [1, 3, 4, 3],
};
const YIELD_STEPS_PER_UNIT = 10_000;
const MIN_DIVIDEND_YIELD = 0.001;
const MIN_EMPLOYEES = 10;

/** Country of every company, allocated by weight and shuffled so ids are not grouped by country. */
function drawCountries(rng: RandomStream, config: CompanyConfig): Country[] {
  const weights = COUNTRIES.map(
    (country) => config.regionWeights[country.regionId] * (config.countryWeights[country.id] ?? 0),
  );
  const counts = allocateByLargestRemainder(config.count, weights);
  const countries: Country[] = [];
  COUNTRIES.forEach((country, index) => {
    for (let i = 0; i < counts[index]; i++) {
      countries.push(country);
    }
  });
  return shuffle(rng, countries);
}

function sizeClass(marketCapEuros: number, config: CompanyConfig): SizeClass {
  if (marketCapEuros >= config.sizeThresholds.large) {
    return 'large';
  }
  return marketCapEuros >= config.sizeThresholds.mid ? 'mid' : 'small';
}

function drawStyle(rng: RandomStream, tilt: number, config: CompanyConfig): Style {
  const value = tilt + normal(rng, 0, config.styleNoise);
  if (value < -STYLE_THRESHOLD) {
    return 'value';
  }
  return value > STYLE_THRESHOLD ? 'growth' : 'blend';
}

function drawCyclicality(rng: RandomStream, base: Cyclicality, config: CompanyConfig): Cyclicality {
  const index = CYCLICALITIES.indexOf(base);
  if (rng.nextFloat53() >= config.cyclicalityDeviation) {
    return base;
  }
  const shifted = rng.nextFloat53() < 0.5 ? index - 1 : index + 1;
  return CYCLICALITIES[Math.min(CYCLICALITIES.length - 1, Math.max(0, shifted))];
}

function riskClass(totalVol: number, bounds: CompanyConfig['riskClassBounds']): RiskClass {
  let level = 1;
  for (const bound of bounds) {
    if (totalVol >= bound) {
      level++;
    }
  }
  return level as RiskClass;
}

export function generateCompanies(
  rng: RandomStream,
  config: CompanyConfig,
  registries: GenerationRegistries,
): Company[] {
  const industryWeights = INDUSTRIES.map((industry) => industry.weight);
  return drawCountries(rng, config).map((country, index) => {
    const region = REGIONS.find((candidate) => candidate.id === country.regionId);
    const exchange = EXCHANGES.find((candidate) => candidate.countryId === country.id);
    if (!region || !exchange) {
      throw new Error(`generateCompanies: incomplete taxonomy for ${country.id}`);
    }
    const industry = INDUSTRIES[weightedIndex(rng, industryWeights)];

    const industryWord =
      rng.nextFloat53() < INDUSTRY_WORD_SHARE ? pick(rng, industry.nameStems) : null;
    const legalForm = pick(rng, country.legalForms);
    const { name } = registries.names.next(rng, (core) =>
      industryWord ? `${core} ${industryWord} ${legalForm}` : `${core} ${legalForm}`,
    );
    const ticker = nextTicker(rng, name, registries.tickers);
    const isin = nextIsin(rng, registries.isins);

    const marketCapEuros = lognormalIn(rng, config.marketCap);
    const size = sizeClass(marketCapEuros, config);
    const startPrice = roundHalfAwayFromZero(lognormalIn(rng, config.startPrice) * 100) / 100;
    const sharesOutstanding = Math.max(1, roundHalfAwayFromZero(marketCapEuros / startPrice));
    const freeFloatShares = Math.max(
      1,
      roundHalfAwayFromZero(sharesOutstanding * uniformIn(rng, config.freeFloat)),
    );

    const style = drawStyle(rng, industry.styleTilt, config);
    const cyclicality = drawCyclicality(rng, industry.cyclicality, config);

    const paysDividend = rng.nextFloat53() >= industry.noDividendShare;
    const dividendYield = paysDividend
      ? Math.max(
          MIN_DIVIDEND_YIELD,
          roundToGrid(
            Math.min(
              config.maxDividendYield,
              uniformIn(rng, industry.dividendYield) * config.dividendStyleFactor[style],
            ),
            YIELD_STEPS_PER_UNIT,
          ),
        )
      : 0;

    const worldBeta = uniformIn(rng, config.worldBeta[cyclicality]);
    const loadings = {
      world: worldBeta,
      region: uniformIn(rng, config.regionLoading),
      sector: uniformIn(rng, config.sectorLoading),
      industry: uniformIn(rng, config.industryLoading),
      style: uniformIn(rng, config.styleLoading[style]),
      size: uniformIn(rng, config.sizeLoading[size]),
    };
    const idioVol = uniformIn(rng, config.idioVol[size]) * industry.volatilityFactor;
    const alpha = normal(rng, 0, config.alphaSd);
    const jumpIntensity = uniformIn(rng, config.jumpIntensity);
    const jumpSd = uniformIn(rng, config.jumpSd);
    const marketVol = worldBeta * config.riskClassMarketVol;
    const totalVol = Math.sqrt(idioVol * idioVol + marketVol * marketVol);

    const foundedYear = uniformInt(rng, config.foundedYear[size][0], config.foundedYear[size][1]);
    const employees = Math.max(
      MIN_EMPLOYEES,
      roundHalfAwayFromZero(marketCapEuros / uniformIn(rng, config.marketCapPerEmployee)),
    );
    const template = PROFILE_TEMPLATES[weightedIndex(rng, PROFILE_WEIGHTS[size])];
    const focus = pick(rng, industry.focusCodes);

    return {
      id: formatId('stk', index + 1),
      name,
      ticker,
      isin,
      regionId: country.regionId,
      countryId: country.id,
      exchangeId: exchange.id,
      sectorId: industry.sectorId,
      industryId: industry.id,
      foundedYear,
      employees,
      size,
      style,
      cyclicality,
      riskClass: riskClass(totalVol, config.riskClassBounds),
      startPrice,
      sharesOutstanding,
      freeFloatShares,
      marketCap: eurosToCents(sharesOutstanding * startPrice),
      savingsPlanEligible: config.savingsPlanSizes.includes(size),
      profile: { template, focus },
      dividend: {
        yield: dividendYield,
        frequency: paysDividend ? region.dividendFrequency : null,
        // Drawn from the stream `world/dividends` (assignDividendSchedules).
        schedule: null,
      },
      model: {
        loadings,
        idioVol,
        alpha,
        jumpIntensity,
        jumpMean: config.jumpMean,
        jumpSd,
      },
    };
  });
}

/** Free-float market capitalisation in euros at the epoch; the weight in indices. */
export function freeFloatMarketCap(company: Company): number {
  return company.freeFloatShares * company.startPrice;
}
