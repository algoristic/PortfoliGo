import { Cents } from '@app/shared/domain/models/money.model';

import { DividendSchedule } from './company.model';

export interface EtfIssuer {
  id: string;
  name: string;
}

export const ETF_REPLICATIONS = ['physical-full', 'physical-sampling', 'synthetic'] as const;
export type EtfReplication = (typeof ETF_REPLICATIONS)[number];

export type EtfDistributionFrequency = 'quarterly' | 'annual';

export type EtfDistribution =
  | { kind: 'accumulating' }
  | {
      kind: 'distributing';
      frequency: EtfDistributionFrequency;
      /** Yearly ex-date rhythm of the distributions, like the dividends of shares (TS §5.6). */
      schedule: DividendSchedule;
    };

export interface Etf {
  id: string;
  name: string;
  ticker: string;
  isin: string;
  issuerId: string;
  indexId: string;
  exchangeId: string;
  distribution: EtfDistribution;
  /** NAV at the epoch in euros. */
  startPrice: number;
  /** Total expense ratio p. a. (0.002 = 0.20 %). */
  ter: number;
  replication: EtfReplication;
  fundVolume: Cents;
  savingsPlanEligible: true;
}
