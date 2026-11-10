import { Hash128, utf8Encode, wordsToBytes } from './hash128';
import { SeedKey } from './seed';

const DISCARDED_OUTPUTS = 12;
const TWO_POW_32 = 4294967296;
const TWO_POW_26 = 67108864;
const TWO_POW_53 = 9007199254740992;

/**
 * Deterministic random stream based on sfc32 (Chris Doty-Humphrey, PractRand) with a 128-bit
 * state. Create streams with `createStream`; distributions live in `distributions.ts`.
 */
export class RandomStream {
  /** Second value of the last Marsaglia polar draw, consumed by the next `normal` call. */
  normalSpare: number | null = null;

  #a: number;
  #b: number;
  #c: number;
  #counter: number;

  constructor(state: ArrayLike<number>) {
    this.#a = state[0] | 0;
    this.#b = state[1] | 0;
    this.#c = state[2] | 0;
    this.#counter = state[3] | 0;
  }

  nextUint32(): number {
    const a = this.#a;
    const b = this.#b;
    const c = this.#c;
    const t = (((a + b) | 0) + this.#counter) | 0;
    this.#counter = (this.#counter + 1) | 0;
    this.#a = b ^ (b >>> 9);
    this.#b = (c + (c << 3)) | 0;
    this.#c = (((c << 21) | (c >>> 11)) + t) | 0;
    return t >>> 0;
  }

  /** Uniform in [0, 1) with 32 bits of resolution. */
  nextFloat32(): number {
    return this.nextUint32() / TWO_POW_32;
  }

  /** Uniform in [0, 1) with 53 bits of resolution (two outputs). */
  nextFloat53(): number {
    const high = this.nextUint32() >>> 5;
    const low = this.nextUint32() >>> 6;
    return (high * TWO_POW_26 + low) / TWO_POW_53;
  }
}

/**
 * Creates the stream for a stable key such as `market/instrument/<id>/<day>` (TS §4.2). The start
 * state is the 128-bit hash of the seed key bytes followed by the UTF-8 key; the first outputs are
 * discarded to decorrelate similar keys.
 */
export function createStream(seedKey: SeedKey, key: string): RandomStream {
  const state = new Hash128().update(wordsToBytes(seedKey)).update(utf8Encode(key)).digest();
  const stream = new RandomStream(state);
  for (let i = 0; i < DISCARDED_OUTPUTS; i++) {
    stream.nextUint32();
  }
  return stream;
}
