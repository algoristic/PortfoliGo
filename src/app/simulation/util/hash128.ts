const C1 = 0x239b961b;
const C2 = 0xab0e9789;
const C3 = 0x38b34ae5;
const C4 = 0xa1e38b93;

const encoder = new TextEncoder();

function rotl(x: number, r: number): number {
  return (x << r) | (x >>> (32 - r));
}

function fmix32(h: number): number {
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h;
}

/**
 * Incremental MurmurHash3 x86_128 (Austin Appleby, public domain). Feeding the same bytes in any
 * chunking yields the result of the reference implementation over the concatenated bytes.
 */
export class Hash128 {
  #h1: number;
  #h2: number;
  #h3: number;
  #h4: number;
  #length = 0;
  readonly #block = new Uint8Array(16);
  #blockLength = 0;

  constructor(seed = 0) {
    this.#h1 = seed | 0;
    this.#h2 = seed | 0;
    this.#h3 = seed | 0;
    this.#h4 = seed | 0;
  }

  update(bytes: Uint8Array): this {
    const block = this.#block;
    for (let i = 0; i < bytes.length; i++) {
      block[this.#blockLength++] = bytes[i];
      if (this.#blockLength === 16) {
        this.#mixBlock();
        this.#blockLength = 0;
      }
    }
    this.#length += bytes.length;
    return this;
  }

  /** Returns h1–h4 as unsigned 32-bit words. The hasher must not be used afterwards. */
  digest(): Uint32Array {
    const tail = this.#block;
    const rest = this.#blockLength;
    let h1 = this.#h1;
    let h2 = this.#h2;
    let h3 = this.#h3;
    let h4 = this.#h4;

    if (rest > 12) {
      let k4 = 0;
      for (let i = rest - 1; i >= 12; i--) {
        k4 = (k4 << 8) | tail[i];
      }
      k4 = Math.imul(rotl(Math.imul(k4, C4), 18), C1);
      h4 ^= k4;
    }
    if (rest > 8) {
      let k3 = 0;
      for (let i = Math.min(rest, 12) - 1; i >= 8; i--) {
        k3 = (k3 << 8) | tail[i];
      }
      k3 = Math.imul(rotl(Math.imul(k3, C3), 17), C4);
      h3 ^= k3;
    }
    if (rest > 4) {
      let k2 = 0;
      for (let i = Math.min(rest, 8) - 1; i >= 4; i--) {
        k2 = (k2 << 8) | tail[i];
      }
      k2 = Math.imul(rotl(Math.imul(k2, C2), 16), C3);
      h2 ^= k2;
    }
    if (rest > 0) {
      let k1 = 0;
      for (let i = Math.min(rest, 4) - 1; i >= 0; i--) {
        k1 = (k1 << 8) | tail[i];
      }
      k1 = Math.imul(rotl(Math.imul(k1, C1), 15), C2);
      h1 ^= k1;
    }

    const length = this.#length;
    h1 ^= length;
    h2 ^= length;
    h3 ^= length;
    h4 ^= length;

    h1 = (h1 + h2) | 0;
    h1 = (h1 + h3) | 0;
    h1 = (h1 + h4) | 0;
    h2 = (h2 + h1) | 0;
    h3 = (h3 + h1) | 0;
    h4 = (h4 + h1) | 0;

    h1 = fmix32(h1);
    h2 = fmix32(h2);
    h3 = fmix32(h3);
    h4 = fmix32(h4);

    h1 = (h1 + h2) | 0;
    h1 = (h1 + h3) | 0;
    h1 = (h1 + h4) | 0;
    h2 = (h2 + h1) | 0;
    h3 = (h3 + h1) | 0;
    h4 = (h4 + h1) | 0;

    return Uint32Array.of(h1, h2, h3, h4);
  }

  #mixBlock(): void {
    const b = this.#block;
    let k1 = b[0] | (b[1] << 8) | (b[2] << 16) | (b[3] << 24);
    let k2 = b[4] | (b[5] << 8) | (b[6] << 16) | (b[7] << 24);
    let k3 = b[8] | (b[9] << 8) | (b[10] << 16) | (b[11] << 24);
    let k4 = b[12] | (b[13] << 8) | (b[14] << 16) | (b[15] << 24);
    let h1 = this.#h1;
    let h2 = this.#h2;
    let h3 = this.#h3;
    let h4 = this.#h4;

    k1 = Math.imul(rotl(Math.imul(k1, C1), 15), C2);
    h1 ^= k1;
    h1 = (rotl(h1, 19) + h2) | 0;
    h1 = (Math.imul(h1, 5) + 0x561ccd1b) | 0;

    k2 = Math.imul(rotl(Math.imul(k2, C2), 16), C3);
    h2 ^= k2;
    h2 = (rotl(h2, 17) + h3) | 0;
    h2 = (Math.imul(h2, 5) + 0x0bcaa747) | 0;

    k3 = Math.imul(rotl(Math.imul(k3, C3), 17), C4);
    h3 ^= k3;
    h3 = (rotl(h3, 15) + h4) | 0;
    h3 = (Math.imul(h3, 5) + 0x96cd1c35) | 0;

    k4 = Math.imul(rotl(Math.imul(k4, C4), 18), C1);
    h4 ^= k4;
    h4 = (rotl(h4, 13) + h1) | 0;
    h4 = (Math.imul(h4, 5) + 0x32ac3b17) | 0;

    this.#h1 = h1;
    this.#h2 = h2;
    this.#h3 = h3;
    this.#h4 = h4;
  }
}

/** MurmurHash3 x86_128 over `bytes`; returns h1–h4 as unsigned 32-bit words. */
export function murmur3x86_128(bytes: Uint8Array, seed = 0): Uint32Array {
  return new Hash128(seed).update(bytes).digest();
}

export function utf8Encode(text: string): Uint8Array {
  return encoder.encode(text);
}

/** Little-endian byte representation of 32-bit words (as stored by the reference implementation). */
export function wordsToBytes(words: ArrayLike<number>): Uint8Array {
  const bytes = new Uint8Array(words.length * 4);
  const view = new DataView(bytes.buffer);
  for (let i = 0; i < words.length; i++) {
    view.setUint32(i * 4, words[i], true);
  }
  return bytes;
}

/** Hex string of the little-endian bytes, matching the usual MurmurHash3 x86_128 hex output. */
export function bytesToHex(bytes: Uint8Array): string {
  let hex = '';
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, '0');
  }
  return hex;
}
