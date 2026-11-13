import { COUNTRIES, INDUSTRIES } from '@app/world/domain/taxonomy';

import { countryLabel, industryLabel } from './taxonomy-labels';

// Industries and countries are data of the world: every code it uses needs its own name.

describe('taxonomy labels', () => {
  it('names every industry of the world once', () => {
    const labels = INDUSTRIES.map((industry) => industryLabel(industry.id));
    INDUSTRIES.forEach((industry, index) => expect(labels[index]).not.toBe(industry.id));
    expect(new Set(labels).size).toBe(INDUSTRIES.length);
  });

  it('names every country of the world once', () => {
    const labels = COUNTRIES.map((country) => countryLabel(country.id));
    COUNTRIES.forEach((country, index) => expect(labels[index]).not.toBe(country.id));
    expect(new Set(labels).size).toBe(COUNTRIES.length);
  });

  it('shows an unknown code as it is', () => {
    expect(industryLabel('quantum-widgets')).toBe('quantum-widgets');
    expect(countryLabel('QQ')).toBe('QQ');
  });
});
