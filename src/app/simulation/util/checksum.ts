import { bytesToHex, Hash128, wordsToBytes } from './hash128';

/**
 * Incremental checksum over Float64 values (little-endian IEEE-754 bytes, MurmurHash3 x86_128).
 * Used by golden-master tests (TS §4.6). `-0` and `0` differ; all NaNs hash alike.
 */
export class Checksum {
  readonly #hash = new Hash128();
  readonly #bytes = new Uint8Array(8);
  readonly #view = new DataView(this.#bytes.buffer);

  addFloat64(value: number): this {
    if (Number.isNaN(value)) {
      // The bit pattern written for NaN is implementation-defined, so write the canonical one.
      this.#view.setUint32(0, 0, true);
      this.#view.setUint32(4, 0x7ff80000, true);
    } else {
      this.#view.setFloat64(0, value, true);
    }
    this.#hash.update(this.#bytes);
    return this;
  }

  addFloat64Array(values: ArrayLike<number>): this {
    for (let i = 0; i < values.length; i++) {
      this.addFloat64(values[i]);
    }
    return this;
  }

  addUint32(value: number): this {
    this.#view.setUint32(0, value, true);
    this.#hash.update(this.#bytes.subarray(0, 4));
    return this;
  }

  /** 32 hex characters. The checksum must not be used afterwards. */
  digest(): string {
    return bytesToHex(wordsToBytes(this.#hash.digest()));
  }
}

export function checksumFloat64(values: ArrayLike<number>): string {
  return new Checksum().addFloat64Array(values).digest();
}
