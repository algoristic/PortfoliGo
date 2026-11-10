import { contrastRatio, relativeLuminance } from './contrast';

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

    it('returns 4.54 for #767676 on white', () => {
      expect(contrastRatio('#767676', '#ffffff')).toBeCloseTo(4.54, 2);
    });
  });
});
