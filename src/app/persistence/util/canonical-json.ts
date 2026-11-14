import { JsonValue } from './tagged-json';

/**
 * Canonical JSON text of `value` (TS §10.1): no whitespace, object keys sorted by UTF-16 code units
 * at every level, arrays in their order; strings and numbers as `JSON.stringify` writes them (the
 * shortest text that reads back the same number, the same in every engine). Throws a `TypeError`
 * for numbers JSON cannot hold (`NaN`, `±Infinity`) and for `undefined`.
 */
export function canonicalJson(value: JsonValue): string {
  switch (typeof value) {
    case 'string':
    case 'boolean':
      return JSON.stringify(value);
    case 'number':
      if (!Number.isFinite(value)) {
        throw new TypeError('canonicalJson: non-finite number');
      }
      return JSON.stringify(value);
    case 'object':
      if (value === null) {
        return 'null';
      }
      if (Array.isArray(value)) {
        return `[${value.map(canonicalJson).join(',')}]`;
      }
      return `{${Object.keys(value)
        .sort()
        .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
        .join(',')}}`;
    default:
      throw new TypeError(`canonicalJson: unsupported ${typeof value}`);
  }
}
