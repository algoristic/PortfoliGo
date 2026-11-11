import { Hash128, utf8Encode, wordsToBytes } from './hash128';
import { SeedKey } from './seed';

const DISCARDED_OUTPUTS = 12;
const TWO_POW_32 = 4294967296;
const TWO_POW_26 = 67108864;
const TWO_POW_53 = 9007199254740992;
const ASCII_ZERO = 48;

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
  return startStream(state);
}

/**
 * Streams whose keys share a prefix and end in a non-negative integer, such as
 * `market/instrument/<id>/<day>`. `create(n)` equals `createStream(seedKey, prefix + n)` bit for
 * bit, but hashes the seed key and the prefix only once – the day step creates hundreds of
 * thousands of streams.
 */
export class StreamFamily {
  readonly #prefix: Hash128;
  readonly #scratch = new Hash128();
  readonly #digits = new Uint8Array(16);

  constructor(seedKey: SeedKey, prefix: string) {
    this.#prefix = new Hash128().update(wordsToBytes(seedKey)).update(utf8Encode(prefix));
  }

  create(n: number): RandomStream {
    if (!Number.isSafeInteger(n) || n < 0) {
      throw new RangeError(`StreamFamily: invalid key suffix ${n}`);
    }
    const hash = this.#scratch.copyFrom(this.#prefix);
    // Decimal digits as ASCII, which is the UTF-8 encoding of String(n).
    let count = 0;
    do {
      this.#digits[count++] = ASCII_ZERO + (n % 10);
      n = Math.floor(n / 10);
    } while (n > 0);
    while (count > 0) {
      hash.updateByte(this.#digits[--count]);
    }
    return startStream(hash.digest());
  }
}

function startStream(state: ArrayLike<number>): RandomStream {
  const stream = new RandomStream(state);
  for (let i = 0; i < DISCARDED_OUTPUTS; i++) {
    stream.nextUint32();
  }
  return stream;
}
