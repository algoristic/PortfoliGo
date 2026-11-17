import { GoldenChecksumId } from '@app/market/domain/golden-master';

/** Checksums of the self-test: the golden master of the market and the player state. */
export type SelfTestChecksumId = GoldenChecksumId | 'player';

/** One checksum of the self-test as shown in the table. */
export interface SelfTestRow {
  id: SelfTestChecksumId;
  label: string;
  value: string;
  matches: boolean;
}
