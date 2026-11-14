import { InstallOffer, PlatformInfo } from './models/pwa.model';
import { installOffer, isIosDevice, storageUsageRatio } from './pwa-logic';

describe('installOffer', () => {
  // TS §13, „Installation“: example table.
  it.each<[PlatformInfo, boolean, boolean, InstallOffer]>([
    [{ standalone: true, ios: false }, false, false, 'installed'],
    [{ standalone: true, ios: true }, false, false, 'installed'],
    [{ standalone: false, ios: false }, true, true, 'installed'],
    [{ standalone: false, ios: false }, true, false, 'prompt'],
    [{ standalone: false, ios: true }, false, false, 'ios-share'],
    [{ standalone: false, ios: false }, false, false, 'unavailable'],
  ])('%o, prompt %s, installed %s → %s', (platform, prompt, installed, expected) => {
    expect(installOffer(platform, prompt, installed)).toBe(expected);
  });
});

describe('isIosDevice', () => {
  // TS §13: user agents of the browsers in question.
  it.each([
    [
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1',
      5,
      true,
    ],
    [
      'Mozilla/5.0 (iPad; CPU OS 16_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/120.0 Mobile/15E148 Safari/604.1',
      5,
      true,
    ],
    [
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15',
      5,
      true,
    ],
    [
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15',
      0,
      false,
    ],
    // A Mac with a single touch input (a pen tablet) is no iPad: iPads report five.
    [
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15',
      1,
      false,
    ],
    [
      'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36',
      5,
      false,
    ],
    [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      10,
      false,
    ],
  ])('%s with %d touch points → %s', (userAgent, touchPoints, expected) => {
    expect(isIosDevice(userAgent, touchPoints)).toBe(expected);
  });
});

describe('storageUsageRatio', () => {
  it('divides the usage by the quota', () => {
    expect(storageUsageRatio(25, 100)).toBe(0.25);
  });

  it.each([
    [null, 100],
    [25, null],
    [25, 0],
  ])('has no ratio for usage %s and quota %s', (usage, quota) => {
    expect(storageUsageRatio(usage, quota)).toBeNull();
  });
});
