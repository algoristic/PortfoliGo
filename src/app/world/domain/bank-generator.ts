import { GenerationRegistries, roundToGrid, uniformIn } from './generator.utils';
import { formatId } from './identifier-logic';
import { Bank } from './models/bank.model';
import { BankConfig, Range } from './models/world-config.model';
import { fillPattern } from './name-logic';
import {
  BRANCH_BANK_PATTERNS,
  DIRECT_BANK_PATTERNS,
  NEO_BROKER_PATTERNS,
  ONLINE_BROKER_PATTERNS,
} from './names/name-parts';

import {
  BankConditions,
  BankType,
  FeeModel,
  INTEREST_PAYOUTS,
  SavingsAccountConditions,
} from '../../banking/domain/models/bank-conditions.model';
import { eurosToCents } from '../../shared/domain/money-logic';
import { pick, uniformInt, weightedIndex } from '../../simulation/util/distributions';
import { RandomStream } from '../../simulation/util/random-stream';

/** Rates in steps of 0.05 percentage points. */
const RATE_STEPS = 2000;
/** Fine rates (custody fee, spread mark-up) in steps of 0.01 percentage points. */
const FINE_RATE_STEPS = 10_000;
/** Tolerated overdraft surcharge in steps of 0.5 percentage points. */
const SURCHARGE_STEPS = 200;

const NAME_PATTERNS: Readonly<Record<BankType, readonly string[]>> = {
  branch: BRANCH_BANK_PATTERNS,
  direct: DIRECT_BANK_PATTERNS,
  'online-broker': ONLINE_BROKER_PATTERNS,
  'neo-broker': NEO_BROKER_PATTERNS,
};

/** Fee in euros drawn from a range, rounded to 10 cents. */
function feeCents(rng: RandomStream, range: Range): number {
  return Math.round(uniformIn(rng, range) * 10) * 10;
}

function rate(rng: RandomStream, range: Range, steps = RATE_STEPS): number {
  return roundToGrid(uniformIn(rng, range), steps);
}

function flatOrFree(amount: number): FeeModel {
  return amount > 0 ? { kind: 'flat', amount } : { kind: 'free' };
}

function savingsAccount(
  rng: RandomStream,
  range: Range,
  config: BankConfig,
): SavingsAccountConditions {
  const payoutWeights = INTEREST_PAYOUTS.map((payout) => config.savingsPayoutWeights[payout]);
  return {
    rate: rate(rng, range),
    payout: INTEREST_PAYOUTS[weightedIndex(rng, payoutWeights)],
  };
}

function branchConditions(rng: RandomStream, config: BankConfig): BankConditions {
  const ranges = config.branch;
  return {
    currentAccount: {
      monthlyFee: feeCents(rng, ranges.monthlyFee),
      overdraft: {
        limitIncomeFactor: config.overdraftLimitIncomeFactor,
        rate: rate(rng, ranges.overdraftRate),
        toleratedSurcharge: rate(rng, ranges.toleratedSurcharge, SURCHARGE_STEPS),
      },
    },
    savingsAccount: savingsAccount(rng, ranges.savingsRate, config),
    depot: {
      custodyFee: {
        kind: 'percent-pa',
        rate: rate(rng, ranges.custodyRate, FINE_RATE_STEPS),
        min: feeCents(rng, ranges.custodyMin),
      },
      orderFee: {
        kind: 'percent',
        rate: ranges.orderRate,
        min: eurosToCents(ranges.orderMin),
        max: eurosToCents(ranges.orderMax),
      },
      exchangeFee: feeCents(rng, ranges.exchangeFee),
      savingsPlanFee: { kind: 'percent', rate: rate(rng, ranges.savingsPlanRate) },
      clearingAccountRate: 0,
      clearingAccountDebitRate: rate(rng, ranges.clearingDebitRate),
      venue: 'exchange',
      spreadMarkup: 0,
      fractionalShares: false,
    },
  };
}

function directConditions(rng: RandomStream, config: BankConfig): BankConditions {
  const ranges = config.direct;
  return {
    currentAccount: {
      monthlyFee: feeCents(rng, ranges.monthlyFee),
      feeWaiver: { minMonthlyDeposits: eurosToCents(ranges.feeWaiverMinDeposits) },
      overdraft: {
        limitIncomeFactor: config.overdraftLimitIncomeFactor,
        rate: rate(rng, ranges.overdraftRate),
        toleratedSurcharge: rate(rng, ranges.toleratedSurcharge, SURCHARGE_STEPS),
      },
    },
    savingsAccount: savingsAccount(rng, ranges.savingsRate, config),
    depot: {
      custodyFee: { kind: 'none' },
      orderFee: {
        kind: 'flat-plus-percent',
        amount: feeCents(rng, ranges.orderFlat),
        rate: ranges.orderRate,
        max: feeCents(rng, ranges.orderMax),
      },
      exchangeFee: 0,
      savingsPlanFee: { kind: 'percent', rate: rate(rng, ranges.savingsPlanRate) },
      clearingAccountRate: 0,
      clearingAccountDebitRate: rate(rng, ranges.clearingDebitRate),
      venue: 'exchange',
      spreadMarkup: 0,
      fractionalShares: false,
    },
  };
}

function onlineBrokerConditions(rng: RandomStream, config: BankConfig): BankConditions {
  const ranges = config.onlineBroker;
  return {
    currentAccount: null,
    savingsAccount: null,
    depot: {
      custodyFee: { kind: 'none' },
      orderFee: flatOrFree(feeCents(rng, ranges.orderFlat)),
      exchangeFee: feeCents(rng, ranges.exchangeFee),
      savingsPlanFee: flatOrFree(feeCents(rng, ranges.savingsPlanFlat)),
      clearingAccountRate: 0,
      clearingAccountDebitRate: rate(rng, ranges.clearingDebitRate),
      venue: 'exchange',
      spreadMarkup: 0,
      fractionalShares: false,
    },
  };
}

function neoBrokerConditions(rng: RandomStream, config: BankConfig): BankConditions {
  const ranges = config.neoBroker;
  return {
    currentAccount: null,
    savingsAccount: null,
    depot: {
      custodyFee: { kind: 'none' },
      orderFee: flatOrFree(feeCents(rng, ranges.orderFlat)),
      exchangeFee: 0,
      savingsPlanFee: { kind: 'free' },
      clearingAccountRate: rate(rng, ranges.clearingRate),
      clearingAccountDebitRate: rate(rng, ranges.clearingDebitRate),
      venue: 'market-maker',
      spreadMarkup: rate(rng, ranges.spreadMarkup, FINE_RATE_STEPS),
      fractionalShares: true,
    },
  };
}

function conditions(rng: RandomStream, type: BankType, config: BankConfig): BankConditions {
  switch (type) {
    case 'branch':
      return branchConditions(rng, config);
    case 'direct':
      return directConditions(rng, config);
    case 'online-broker':
      return onlineBrokerConditions(rng, config);
    case 'neo-broker':
      return neoBrokerConditions(rng, config);
  }
}

export function generateBanks(
  rng: RandomStream,
  config: BankConfig,
  registries: GenerationRegistries,
): Bank[] {
  const types: BankType[] = [];
  for (const { type, count } of config.composition) {
    const n = uniformInt(rng, count[0], count[1]);
    for (let i = 0; i < n; i++) {
      types.push(type);
    }
  }
  return types.map((type, index) => {
    const pattern = pick(rng, NAME_PATTERNS[type]);
    const { name } = registries.names.next(rng, (core) => fillPattern(pattern, core));
    return {
      id: formatId('bnk', index + 1),
      name,
      type,
      conditions: conditions(rng, type, config),
    };
  });
}
