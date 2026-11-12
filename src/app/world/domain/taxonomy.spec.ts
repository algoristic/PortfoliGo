import { MINUTES_PER_DAY } from '@app/clock/domain/models/time.model';

import { DEFAULT_WORLD_CONFIG } from './default-world-config';
import { REGION_IDS, SECTOR_IDS } from './models/taxonomy.model';
import { COUNTRIES, EXCHANGES, INDUSTRIES, REGIONS, SECTORS } from './taxonomy';

describe('taxonomy', () => {
  it('has the dimensions of the standard world (TS §5.2)', () => {
    expect(REGIONS.map((region) => region.id)).toEqual([...REGION_IDS]);
    expect(SECTORS.map((sector) => sector.id)).toEqual([...SECTOR_IDS]);
    expect(REGIONS).toHaveLength(4);
    expect(COUNTRIES).toHaveLength(12);
    expect(EXCHANGES).toHaveLength(12);
    expect(SECTORS).toHaveLength(11);
    expect(INDUSTRIES).toHaveLength(31);
  });

  it('has unique ids', () => {
    for (const list of [COUNTRIES, EXCHANGES, INDUSTRIES]) {
      expect(new Set(list.map((item) => item.id)).size).toBe(list.length);
    }
  });

  it('references existing entries', () => {
    const countryIds = new Set(COUNTRIES.map((country) => country.id));
    for (const country of COUNTRIES) {
      expect(REGION_IDS).toContain(country.regionId);
      expect(country.legalForms.length).toBeGreaterThan(0);
      expect(EXCHANGES.filter((exchange) => exchange.countryId === country.id)).toHaveLength(1);
    }
    for (const exchange of EXCHANGES) {
      expect(countryIds.has(exchange.countryId)).toBe(true);
    }
    for (const sectorId of SECTOR_IDS) {
      expect(INDUSTRIES.some((industry) => industry.sectorId === sectorId)).toBe(true);
    }
  });

  it('has trading hours within the day and industry tendencies within the configuration', () => {
    for (const exchange of EXCHANGES) {
      expect(exchange.open).toBeGreaterThanOrEqual(0);
      expect(exchange.open).toBeLessThan(exchange.close);
      expect(exchange.close).toBeLessThanOrEqual(MINUTES_PER_DAY);
    }
    for (const industry of INDUSTRIES) {
      expect(industry.weight).toBeGreaterThan(0);
      expect(industry.dividendYield[0]).toBeLessThanOrEqual(industry.dividendYield[1]);
      expect(industry.dividendYield[1]).toBeLessThanOrEqual(
        DEFAULT_WORLD_CONFIG.companies.maxDividendYield,
      );
      expect(industry.nameStems.length).toBeGreaterThan(0);
      expect(industry.focusCodes.length).toBeGreaterThan(0);
    }
  });
});
