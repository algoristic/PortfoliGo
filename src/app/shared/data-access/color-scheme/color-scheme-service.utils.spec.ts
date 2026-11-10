import { resolveColorScheme } from './color-scheme-service.utils';

describe('resolveColorScheme', () => {
  it('returns dark when the system prefers dark', () => {
    expect(resolveColorScheme(true)).toBe('dark');
  });

  it('returns light when the system prefers light', () => {
    expect(resolveColorScheme(false)).toBe('light');
  });
});
