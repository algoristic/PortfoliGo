import { Cents } from '../../../shared/domain/models/money.model';

export interface EtfIssuer {
  id: string;
  name: string;
}

export const ETF_REPLICATIONS = ['physical-full', 'physical-sampling', 'synthetic'] as const;
export type EtfReplication = (typeof ETF_REPLICATIONS)[number];

export type EtfDistribution =
  { kind: 'accumulating' } | { kind: 'distributing'; frequency: 'quarterly' | 'annual' };

export interface Etf {
  id: string;
  name: string;
  ticker: string;
  isin: string;
  issuerId: string;
  indexId: string;
  exchangeId: string;
  distribution: EtfDistribution;
  /** Total expense ratio p. a. (0.002 = 0.20 %). */
  ter: number;
  replication: EtfReplication;
  fundVolume: Cents;
  savingsPlanEligible: true;
}
