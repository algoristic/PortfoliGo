import { bytesToHex, murmur3x86_128, utf8Encode, wordsToBytes } from '@app/simulation/util/hash128';

import { World } from './models/world.model';

/**
 * Checksum over the complete world (32 hex characters). The JSON serialisation is deterministic
 * because the generators build every object with a fixed property order.
 */
export function worldChecksum(world: World): string {
  return bytesToHex(wordsToBytes(murmur3x86_128(utf8Encode(JSON.stringify(world)))));
}
