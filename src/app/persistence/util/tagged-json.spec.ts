import fc from 'fast-check';

import { fromTaggedJson, toTaggedJson } from './tagged-json';

// TS §10.1: the state in the export file is JSON with tags for what JSON cannot hold.

const arbKey = fc.string().filter((key) => !key.startsWith('$') && key !== '__proto__');

const { value: arbValue } = fc.letrec((tie) => ({
  value: fc.oneof(
    { depthSize: 'small', withCrossShrink: true },
    fc.constant(null),
    fc.boolean(),
    fc.string(),
    fc.double(),
    fc.array(tie('value')),
    fc.dictionary(arbKey, tie('value'), { noNullPrototype: true }),
    fc.array(fc.tuple(fc.string(), tie('value'))).map((entries) => new Map(entries)),
    fc.float64Array(),
    fc.int32Array(),
  ),
}));

describe('toTaggedJson', () => {
  // TS §10.1: maps, typed arrays and the numbers JSON lacks become one-key objects.
  it.each([
    [new Map([['acc-1', 5]]), { $map: [['acc-1', 5]] }],
    [Float64Array.of(1.5, NaN, -0), { $f64: [1.5, { $num: 'NaN' }, { $num: '-0' }] }],
    [Int32Array.of(-1, 7), { $i32: [-1, 7] }],
    [Infinity, { $num: 'Infinity' }],
    [-Infinity, { $num: '-Infinity' }],
    [{ a: undefined, b: [0] }, { b: [0] }],
  ])('encodes %o as %o', (value, expected) => {
    expect(toTaggedJson(value)).toEqual(expected);
  });

  it.each([
    ['a set', new Set([1])],
    ['a date', new Date(0)],
    ['a Float32Array', new Float32Array(1)],
    ['undefined in an array', [undefined]],
    ['a reserved key', { $map: [] }],
    ['a function', () => 1],
    ['a bigint', BigInt(1)],
    ['undefined', undefined],
  ])('rejects %s', (_label, value) => {
    expect(() => toTaggedJson(value)).toThrow(TypeError);
  });

  it('reads back every value through JSON text, -0 and NaN included', () => {
    fc.assert(
      fc.property(arbValue, (value) => {
        const read = fromTaggedJson(JSON.parse(JSON.stringify(toTaggedJson(value))));
        expect(read).toStrictEqual(value);
      }),
    );
  });
});

describe('fromTaggedJson', () => {
  it.each([
    ['an unknown tag', { $set: [] }],
    ['a tag without an array', { $map: 1 }],
    ['a map entry that is no pair', { $map: [[1]] }],
    ['a Float64Array with a string', { $f64: ['1'] }],
    ['an Int32Array with a fraction', { $i32: [1.5] }],
    ['an unknown special number', { $num: 'nan' }],
    ['a reserved key beside others', { $map: [], a: 1 }],
  ])('rejects %s', (_label, value) => {
    expect(() => fromTaggedJson(value)).toThrow(TypeError);
  });
});
