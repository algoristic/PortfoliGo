// JSON for structured-cloneable state (TS §10.1): plain objects, arrays, strings, booleans, `null`,
// numbers, `Map`, `Float64Array` and `Int32Array`. JSON alone loses maps, typed arrays, `NaN`,
// `±Infinity` and `-0`, so these become objects with exactly one reserved key (`$map`, `$f64`,
// `$i32`, `$num`). Plain objects must therefore not have keys that start with `$`.

export type JsonValue =
  string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

const MAP_TAG = '$map';
const FLOAT64_TAG = '$f64';
const INT32_TAG = '$i32';
const NUMBER_TAG = '$num';

const SPECIAL_NUMBERS = ['NaN', 'Infinity', '-Infinity', '-0'] as const;
type SpecialNumber = (typeof SPECIAL_NUMBERS)[number];

/**
 * Converts `value` into plain JSON data. Throws a `TypeError` for anything else (`undefined` in
 * arrays, sets, dates, other typed arrays, class instances, functions, keys starting with `$`);
 * object fields that are `undefined` are left out, as `JSON.stringify` does.
 */
export function toTaggedJson(value: unknown): JsonValue {
  switch (typeof value) {
    case 'string':
    case 'boolean':
      return value;
    case 'number':
      return encodeNumber(value);
    case 'object':
      return value === null ? null : encodeObject(value);
    default:
      throw new TypeError(`toTaggedJson: unsupported ${typeof value}`);
  }
}

/** Reverses `toTaggedJson`. Throws a `TypeError` for a malformed tag or a key starting with `$`. */
export function fromTaggedJson(value: unknown): unknown {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'number') {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(fromTaggedJson);
  }
  if (typeof value !== 'object') {
    throw new TypeError(`fromTaggedJson: unsupported ${typeof value}`);
  }
  const fields = value as Record<string, unknown>;
  const keys = Object.keys(fields);
  const tag = keys.length === 1 && keys[0].startsWith('$') ? keys[0] : null;
  if (tag !== null) {
    return decodeTag(tag, fields[tag]);
  }
  const result: Record<string, unknown> = {};
  for (const key of keys) {
    if (key.startsWith('$')) {
      throw new TypeError(`fromTaggedJson: reserved key ${key}`);
    }
    result[key] = fromTaggedJson(fields[key]);
  }
  return result;
}

function encodeNumber(value: number): JsonValue {
  if (Number.isNaN(value)) {
    return { [NUMBER_TAG]: 'NaN' };
  }
  if (value === Infinity) {
    return { [NUMBER_TAG]: 'Infinity' };
  }
  if (value === -Infinity) {
    return { [NUMBER_TAG]: '-Infinity' };
  }
  if (Object.is(value, -0)) {
    return { [NUMBER_TAG]: '-0' };
  }
  return value;
}

function encodeObject(value: object): JsonValue {
  if (Array.isArray(value)) {
    return value.map((item: unknown) => {
      if (item === undefined) {
        throw new TypeError('toTaggedJson: undefined in an array');
      }
      return toTaggedJson(item);
    });
  }
  if (value instanceof Map) {
    return {
      [MAP_TAG]: [...value.entries()].map(([key, item]) => [toTaggedJson(key), toTaggedJson(item)]),
    };
  }
  if (value instanceof Float64Array) {
    return { [FLOAT64_TAG]: Array.from(value, encodeNumber) };
  }
  if (value instanceof Int32Array) {
    return { [INT32_TAG]: Array.from(value) };
  }
  const prototype = Object.getPrototypeOf(value) as unknown;
  if (prototype !== Object.prototype && prototype !== null) {
    throw new TypeError('toTaggedJson: unsupported object');
  }
  const result: Record<string, JsonValue> = {};
  for (const [key, item] of Object.entries(value)) {
    if (key.startsWith('$')) {
      throw new TypeError(`toTaggedJson: reserved key ${key}`);
    }
    if (item !== undefined) {
      result[key] = toTaggedJson(item);
    }
  }
  return result;
}

function decodeTag(tag: string, content: unknown): unknown {
  switch (tag) {
    case MAP_TAG:
      return new Map(arrayOf(content, decodeEntry));
    case FLOAT64_TAG:
      return Float64Array.from(arrayOf(content, decodeNumber));
    case INT32_TAG:
      return Int32Array.from(arrayOf(content, decodeInt32));
    case NUMBER_TAG:
      return decodeSpecial(content);
    default:
      throw new TypeError(`fromTaggedJson: unknown tag ${tag}`);
  }
}

function arrayOf<T>(content: unknown, decode: (item: unknown) => T): T[] {
  if (!Array.isArray(content)) {
    throw new TypeError('fromTaggedJson: tag without an array');
  }
  return content.map(decode);
}

function decodeEntry(entry: unknown): [unknown, unknown] {
  if (!Array.isArray(entry) || entry.length !== 2) {
    throw new TypeError('fromTaggedJson: map entry is no pair');
  }
  return [fromTaggedJson(entry[0]), fromTaggedJson(entry[1])];
}

function decodeNumber(item: unknown): number {
  if (typeof item === 'number') {
    return item;
  }
  if (typeof item === 'object' && item !== null && !Array.isArray(item)) {
    const keys = Object.keys(item);
    if (keys.length === 1 && keys[0] === NUMBER_TAG) {
      return decodeSpecial((item as Record<string, unknown>)[NUMBER_TAG]);
    }
  }
  throw new TypeError('fromTaggedJson: no number');
}

function decodeInt32(item: unknown): number {
  if (typeof item !== 'number' || (item | 0) !== item) {
    throw new TypeError('fromTaggedJson: no 32-bit integer');
  }
  return item;
}

function decodeSpecial(content: unknown): number {
  if (!(SPECIAL_NUMBERS as readonly unknown[]).includes(content)) {
    throw new TypeError('fromTaggedJson: unknown special number');
  }
  switch (content as SpecialNumber) {
    case 'NaN':
      return NaN;
    case 'Infinity':
      return Infinity;
    case '-Infinity':
      return -Infinity;
    case '-0':
      return -0;
  }
}
