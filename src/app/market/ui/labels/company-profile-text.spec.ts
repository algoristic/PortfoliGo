import { PROFILE_TEMPLATES } from '@app/world/domain/models/company.model';
import { COUNTRIES, INDUSTRIES } from '@app/world/domain/taxonomy';

import { companyProfileText, focusLabel } from './company-profile-text';

// Focus codes are data of the world (TS §5.4): every code the generator can pick needs a name.
const FOCUS_CODES = INDUSTRIES.flatMap((industry) => industry.focusCodes);

describe('focusLabel', () => {
  it('names every focus code of the world once', () => {
    const labels = FOCUS_CODES.map(focusLabel);
    FOCUS_CODES.forEach((code, index) => expect(labels[index]).not.toBe(code));
    expect(new Set(labels).size).toBe(FOCUS_CODES.length);
  });

  it('shows an unknown code as it is', () => {
    expect(focusLabel('quantum-widgets')).toBe('quantum-widgets');
  });
});

describe('companyProfileText', () => {
  it.each([
    [
      'market-leader',
      'Marktführer im Bereich Speicherchips und einer der größten Anbieter der Branche Halbleiter. Gegründet 1987, Heimatmarkt: Deutschland.',
    ],
    [
      'challenger',
      'Herausforderer im Bereich Speicherchips, der den etablierten Anbietern der Branche Halbleiter Marktanteile abnimmt. Gegründet 1987, Heimatmarkt: Deutschland.',
    ],
    [
      'specialist',
      'Spezialist im Bereich Speicherchips mit einer klaren Nische in der Branche Halbleiter. Gegründet 1987, Heimatmarkt: Deutschland.',
    ],
    [
      'family-owned',
      'Familiengeführtes Unternehmen im Bereich Speicherchips aus der Branche Halbleiter; die Gründerfamilie prägt die Strategie bis heute. Gegründet 1987, Heimatmarkt: Deutschland.',
    ],
  ] as const)('writes the %s template with its parameters', (template, text) => {
    expect(
      companyProfileText({
        profile: { template, focus: 'memory-chips' },
        industryId: 'semiconductors',
        countryId: 'DE',
        foundedYear: 1987,
      }),
    ).toBe(text);
  });

  it('gives a text without placeholders for every template, industry, focus code and country', () => {
    const texts = new Set<string>();
    for (const template of PROFILE_TEMPLATES) {
      for (const industry of INDUSTRIES) {
        for (const focus of industry.focusCodes) {
          for (const country of COUNTRIES) {
            const text = companyProfileText({
              profile: { template, focus },
              industryId: industry.id,
              countryId: country.id,
              foundedYear: 1901,
            });
            expect(text).toContain('1901');
            expect(text).not.toMatch(/[{}:]\w+:|\$|undefined/);
            expect(text).not.toContain(focus);
            texts.add(text);
          }
        }
      }
    }
    expect(texts.size).toBe(PROFILE_TEMPLATES.length * FOCUS_CODES.length * COUNTRIES.length);
  });
});
