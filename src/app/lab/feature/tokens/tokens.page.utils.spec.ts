import { buildContrastRows } from './tokens.page.utils';

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
    expect(rows[0]).toEqual({
      foreground: 'fg',
      background: 'bg',
      minimum: 4.5,
      ratio: 21,
      passes: true,
    });
  });

  it('marks pairs below 4.5:1 as failing', () => {
    const rows = buildContrastRows({ bg: '#ffffff', warning: '#ffff00' });
    expect(rows).toEqual([
      expect.objectContaining({ foreground: 'warning', background: 'bg', passes: false }),
    ]);
  });

  it('requires 3:1 for chart colours', () => {
    // #949494 on white is about 3.03:1, #999999 about 2.85:1 (WCAG relative luminance).
    const rows = buildContrastRows({ bg: '#ffffff', 'chart-1': '#949494', 'chart-2': '#999999' });
    expect(rows).toEqual([
      expect.objectContaining({ foreground: 'chart-1', minimum: 3, passes: true }),
      expect.objectContaining({ foreground: 'chart-2', minimum: 3, passes: false }),
    ]);
  });

  it('skips pairs with missing values', () => {
    expect(buildContrastRows({ fg: '#000000' })).toEqual([]);
  });
});
