import fc from 'fast-check';

import { contrastRatio, relativeLuminance } from './contrast';

const arbHex = fc
  .tuple(fc.nat({ max: 255 }), fc.nat({ max: 255 }), fc.nat({ max: 255 }))
  .map((channels) => `#${channels.map((c) => c.toString(16).padStart(2, '0')).join('')}`);

describe('contrast', () => {
  describe('relativeLuminance', () => {
    it('returns 0 for black and 1 for white', () => {
      expect(relativeLuminance('#000000')).toBe(0);
      expect(relativeLuminance('#ffffff')).toBe(1);
    });

    it('accepts upper-case hex values', () => {
      expect(relativeLuminance('#FFFFFF')).toBe(1);
    });

    it('throws when the value is not a #rrggbb colour', () => {
      expect(() => relativeLuminance('#fff')).toThrow();
      expect(() => relativeLuminance('rgb(0, 0, 0)')).toThrow();
    });
  });

  describe('contrastRatio', () => {
    it('returns 21 for black on white', () => {
      expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 10);
    });

    it('returns 1 for identical colours', () => {
      expect(contrastRatio('#4c9eff', '#4c9eff')).toBe(1);
    });

    it('returns the same ratio regardless of argument order', () => {
      expect(contrastRatio('#767676', '#ffffff')).toBe(contrastRatio('#ffffff', '#767676'));
    });

    it('is symmetric and lies between 1 and 21 for any two colours', () => {
      fc.assert(
        fc.property(arbHex, arbHex, (a, b) => {
          const ratio = contrastRatio(a, b);
          expect(contrastRatio(b, a)).toBe(ratio);
          expect(ratio).toBeGreaterThanOrEqual(1);
          expect(ratio).toBeLessThanOrEqual(21 + 1e-12);
          expect(contrastRatio(a, a)).toBe(1);
        }),
      );
    });

    it('grows when a grey gets lighter against black', () => {
      fc.assert(
        fc.property(fc.nat({ max: 254 }), (level) => {
          const grey = (value: number): string =>
            `#${value.toString(16).padStart(2, '0').repeat(3)}`;
          expect(contrastRatio(grey(level + 1), '#000000')).toBeGreaterThan(
            contrastRatio(grey(level), '#000000'),
          );
        }),
      );
    });

    // Reference value of the WCAG contrast checkers (WebAIM): #767676 is the lightest grey with
    // at least 4.5:1 on white.
    it('returns 4.54 for #767676 on white', () => {
      expect(contrastRatio('#767676', '#ffffff')).toBeCloseTo(4.54, 2);
    });
  });
});
