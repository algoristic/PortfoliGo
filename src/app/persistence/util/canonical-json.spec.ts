import fc from 'fast-check';

import { canonicalJson } from './canonical-json';
import { JsonValue } from './tagged-json';

// TS §10.1: the checksum covers the canonical JSON, keys sorted at every level.

describe('canonicalJson', () => {
  it.each([
    [
      { b: 1, a: [true, null], c: { z: 'x', y: 2.5 } },
      '{"a":[true,null],"b":1,"c":{"y":2.5,"z":"x"}}',
    ],
    [{ B: 1, a: 2, _: 3, '10': 4, '9': 5 }, '{"10":4,"9":5,"B":1,"_":3,"a":2}'],
    [[3, 1, 2], '[3,1,2]'],
    ['ä"\n', '"ä\\"\\n"'],
    [1e21, '1e+21'],
    [0.1, '0.1'],
    [{}, '{}'],
  ])('writes %o as %s', (value, expected) => {
    expect(canonicalJson(value)).toBe(expected);
  });

  it.each([NaN, Infinity, -Infinity])('rejects %d', (value) => {
    expect(() => canonicalJson(value)).toThrow(TypeError);
  });

  it('does not depend on the key order and reads back as the same value', () => {
    fc.assert(
      fc.property(fc.jsonValue() as fc.Arbitrary<JsonValue>, (value) => {
        const text = canonicalJson(value);
        // Like JSON itself, the text writes -0 as 0.
        expect(JSON.parse(text)).toEqual(JSON.parse(JSON.stringify(value)));
        const reversed = JSON.parse(JSON.stringify(value), (_key, item: unknown) =>
          item !== null && typeof item === 'object' && !Array.isArray(item)
            ? Object.fromEntries(Object.entries(item).reverse())
            : item,
        ) as typeof value;
        expect(canonicalJson(reversed)).toBe(text);
      }),
    );
  });
});
