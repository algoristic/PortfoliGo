import fc from 'fast-check';

import { isVersionedEntry } from './local-storage-service.utils';

// Stored values are versioned JSON `{ v, data }` (TS §9.3); anything else counts as missing.
const arbVersion = fc.integer({ min: 0, max: 1_000 });
const arbOtherKeys = fc.dictionary(
  fc.string().filter((key) => key !== 'v' && key !== 'data'),
  fc.jsonValue(),
  { maxKeys: 3 },
);

describe('isVersionedEntry', () => {
  it('accepts objects with a numeric version and data, also after a JSON round trip', () => {
    fc.assert(
      fc.property(arbVersion, fc.jsonValue(), arbOtherKeys, (v, data, others) => {
        const entry = { ...others, v, data };
        expect(isVersionedEntry(entry)).toBe(true);
        expect(isVersionedEntry(JSON.parse(JSON.stringify(entry)))).toBe(true);
      }),
    );
  });

  it('rejects JSON values that are not objects', () => {
    const arbNonObject = fc.oneof(
      fc.constant(null),
      fc.boolean(),
      fc.double(),
      fc.string(),
      fc.array(fc.jsonValue(), { maxLength: 3 }),
    );
    fc.assert(
      fc.property(arbNonObject, (value) => {
        expect(isVersionedEntry(value)).toBe(false);
      }),
    );
  });

  it('rejects objects without data', () => {
    fc.assert(
      fc.property(arbVersion, arbOtherKeys, (v, others) => {
        expect(isVersionedEntry({ ...others, v })).toBe(false);
      }),
    );
  });

  it('rejects objects whose version is not a number', () => {
    const arbNoNumber = fc.oneof(fc.constant(null), fc.boolean(), fc.string(), fc.constant('1'));
    fc.assert(
      fc.property(arbNoNumber, fc.jsonValue(), arbOtherKeys, (v, data, others) => {
        expect(isVersionedEntry({ ...others, v, data })).toBe(false);
      }),
    );
    fc.assert(
      fc.property(fc.jsonValue(), arbOtherKeys, (data, others) => {
        expect(isVersionedEntry({ ...others, data })).toBe(false);
      }),
    );
  });
});
