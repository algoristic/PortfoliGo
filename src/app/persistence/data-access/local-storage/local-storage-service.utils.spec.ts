import { isVersionedEntry } from './local-storage-service.utils';

describe('isVersionedEntry', () => {
  it('accepts objects with a numeric version and data', () => {
    expect(isVersionedEntry({ v: 1, data: null })).toBe(true);
  });

  it('rejects other values', () => {
    expect(isVersionedEntry(null)).toBe(false);
    expect(isVersionedEntry('p1')).toBe(false);
    expect(isVersionedEntry({ v: '1', data: 1 })).toBe(false);
    expect(isVersionedEntry({ v: 1 })).toBe(false);
  });
});
