import { murmur3x86_128, utf8Encode } from './hash128';

/** 128-bit key derived from the normalised seed (4 unsigned 32-bit words). */
export type SeedKey = Readonly<Uint32Array>;

/** Trims surrounding whitespace, lowercases and applies Unicode NFC (TS §4.1). */
export function normalizeSeed(seed: string): string {
  return seed.trim().toLowerCase().normalize('NFC');
}

export function deriveSeedKey(seed: string): SeedKey {
  return murmur3x86_128(utf8Encode(normalizeSeed(seed)));
}
