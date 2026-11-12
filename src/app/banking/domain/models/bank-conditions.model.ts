import { Cents } from '@app/shared/domain/models/money.model';

export const BANK_TYPES = ['branch', 'direct', 'online-broker', 'neo-broker'] as const;
export type BankType = (typeof BANK_TYPES)[number];

export type FeeModel =
  | { kind: 'free' }
  | { kind: 'flat'; amount: Cents }
  | { kind: 'percent'; rate: number; min?: Cents; max?: Cents }
  | { kind: 'flat-plus-percent'; amount: Cents; rate: number; min?: Cents; max?: Cents }
  | { kind: 'tiered'; tiers: { upToVolume: Cents | null; fee: FeeModel }[] };

export interface CurrentAccountConditions {
  monthlyFee: Cents;
  /** The monthly fee is waived when the deposits of the previous month reach this amount. */
  feeWaiver?: { minMonthlyDeposits: Cents };
  /** Limit = factor × net income; above the limit the rate rises by `toleratedSurcharge`. */
  overdraft: { limitIncomeFactor: number; rate: number; toleratedSurcharge: number };
}

export const INTEREST_PAYOUTS = ['monthly', 'quarterly'] as const;
export type InterestPayout = (typeof INTEREST_PAYOUTS)[number];

export interface SavingsAccountConditions {
  rate: number;
  payout: InterestPayout;
}

export type CustodyFee =
  | { kind: 'none' }
  | { kind: 'percent-pa'; rate: number; min?: Cents; max?: Cents }
  | { kind: 'flat-pa'; amount: Cents };

export const TRADING_VENUES = ['exchange', 'market-maker'] as const;
export type TradingVenue = (typeof TRADING_VENUES)[number];

export interface DepotConditions {
  custodyFee: CustodyFee;
  orderFee: FeeModel;
  exchangeFee: Cents;
  savingsPlanFee: FeeModel;
  clearingAccountRate: number;
  /** Debit rate for a negative clearing account. */
  clearingAccountDebitRate: number;
  venue: TradingVenue;
  spreadMarkup: number;
  /** Fractional shares for single orders; savings plans always buy fractions. */
  fractionalShares: boolean;
}

export interface BankConditions {
  currentAccount: CurrentAccountConditions | null;
  savingsAccount: SavingsAccountConditions | null;
  depot: DepotConditions;
}
