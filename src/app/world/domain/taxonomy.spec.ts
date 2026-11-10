import { REGION_IDS, SECTOR_IDS } from './models/taxonomy.model';
import { COUNTRIES, EXCHANGES, INDUSTRIES, REGIONS, SECTORS } from './taxonomy';

describe('taxonomy', () => {
  it('has the dimensions of the standard world', () => {
    expect(REGIONS.map((region) => region.id)).toEqual([...REGION_IDS]);
    expect(SECTORS.map((sector) => sector.id)).toEqual([...SECTOR_IDS]);
    expect(COUNTRIES).toHaveLength(12);
    expect(EXCHANGES).toHaveLength(12);
    expect(INDUSTRIES.length).toBeGreaterThanOrEqual(28);
    expect(INDUSTRIES.length).toBeLessThanOrEqual(32);
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

  it('has plausible trading hours and industry tendencies', () => {
    for (const exchange of EXCHANGES) {
      expect(exchange.open).toBeGreaterThanOrEqual(0);
      expect(exchange.open).toBeLessThan(exchange.close);
      expect(exchange.close).toBeLessThanOrEqual(1440);
    }
    for (const industry of INDUSTRIES) {
      expect(industry.weight).toBeGreaterThan(0);
      expect(industry.dividendYield[0]).toBeLessThanOrEqual(industry.dividendYield[1]);
      expect(industry.dividendYield[1]).toBeLessThanOrEqual(0.07);
      expect(industry.nameStems.length).toBeGreaterThan(0);
      expect(industry.focusCodes.length).toBeGreaterThan(0);
    }
  });
});
