import { APP_NAME, formatPageTitle } from './page-title.utils';

describe('formatPageTitle', () => {
  it('appends the app name to the page title', () => {
    expect(formatPageTitle('Märkte')).toBe(`Märkte · ${APP_NAME}`);
  });

  it('returns the app name when the route has no title', () => {
    expect(formatPageTitle(undefined)).toBe(APP_NAME);
    expect(formatPageTitle('')).toBe(APP_NAME);
  });
});
