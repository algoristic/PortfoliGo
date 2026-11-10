import { buildContrastRows } from './tokens-page.utils';

describe('buildContrastRows', () => {
  it('returns one row per text and background token pair', () => {
    const rows = buildContrastRows({
      bg: '#ffffff',
      surface: '#ffffff',
      'surface-raised': '#ffffff',
      fg: '#000000',
      'fg-muted': '#767676',
      accent: '#000000',
      up: '#000000',
      down: '#000000',
      warning: '#ffff00',
    });
    expect(rows).toHaveLength(18);
    expect(rows[0]).toEqual({ foreground: 'fg', background: 'bg', ratio: 21, passes: true });
  });

  it('marks pairs below 4.5:1 as failing', () => {
    const rows = buildContrastRows({ bg: '#ffffff', warning: '#ffff00' });
    expect(rows).toEqual([
      expect.objectContaining({ foreground: 'warning', background: 'bg', passes: false }),
    ]);
  });

  it('skips pairs with missing values', () => {
    expect(buildContrastRows({ fg: '#000000' })).toEqual([]);
  });
});
