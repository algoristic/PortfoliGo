import { isQuotaExceeded } from './quota';

describe('isQuotaExceeded', () => {
  it.each([
    ['a DOMException of IndexedDB', new DOMException('full', 'QuotaExceededError'), true],
    ['localStorage of older Firefox', { name: 'NS_ERROR_DOM_QUOTA_REACHED' }, true],
    ['a cloned error of another realm', { name: 'QuotaExceededError', message: 'full' }, true],
    [
      'a wrapped quota error',
      new Error('write failed', { cause: { name: 'QuotaExceededError' } }),
      true,
    ],
    ['an aborted transaction', new DOMException('aborted', 'AbortError'), false],
    ['another error', new Error('QuotaExceededError'), false],
    ['a string', 'QuotaExceededError', false],
    ['null', null, false],
    ['undefined', undefined, false],
  ])('recognises %s', (_case, error, expected) => {
    expect(isQuotaExceeded(error)).toBe(expected);
  });

  it('stops after a few causes', () => {
    let error: unknown = { name: 'QuotaExceededError' };
    for (let depth = 0; depth < 4; depth++) {
      error = { name: 'Error', cause: error };
    }
    expect(isQuotaExceeded(error)).toBe(false);
  });
});
