import { GoldenChecksumId } from '@app/market/domain/golden-master';

/** One checksum of the self-test as shown in the table. */
export interface SelfTestRow {
  id: GoldenChecksumId;
  label: string;
  value: string;
  matches: boolean;
}
