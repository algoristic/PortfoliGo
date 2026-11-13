import {
  CurrentAccountConditions,
  DepotConditions,
  FeeModel,
} from '@app/banking/domain/models/bank-conditions.model';

import {
  accountFeeText,
  clearingText,
  custodyFeeText,
  feeModelText,
  fractionalSharesText,
  orderFeeText,
  overdraftText,
  savingsText,
  venueText,
} from './bank-conditions-text';

/** Intl puts a no-break space before the unit; the texts read with plain spaces. */
function plain(text: string): string {
  return text.replace(/\s/g, ' ');
}

const DEPOT: DepotConditions = {
  custodyFee: { kind: 'none' },
  orderFee: { kind: 'percent', rate: 0.0025, min: 1_000, max: 6_000 },
  exchangeFee: 300,
  savingsPlanFee: { kind: 'free' },
  clearingAccountRate: 0.0115,
  clearingAccountDebitRate: 0.0845,
  venue: 'exchange',
  spreadMarkup: 0,
  fractionalShares: false,
};

const DIRECT: CurrentAccountConditions = {
  monthlyFee: 540,
  feeWaiver: { minMonthlyDeposits: 70_000 },
  overdraft: { limitIncomeFactor: 2, rate: 0.0945, toleratedSurcharge: 0.045 },
};

describe('feeModelText', () => {
  it.each<[FeeModel, string]>([
    [{ kind: 'free' }, 'kostenlos'],
    [{ kind: 'flat', amount: 490 }, '4,90 €'],
    [{ kind: 'percent', rate: 0.019 }, '1,90 %'],
    [
      { kind: 'percent', rate: 0.0025, min: 1_000, max: 6_000 },
      '0,25 %, mind. 10,00 €, max. 60,00 €',
    ],
    [
      { kind: 'flat-plus-percent', amount: 530, rate: 0.0025, max: 6_440 },
      '5,30 € + 0,25 %, max. 64,40 €',
    ],
    [
      {
        kind: 'tiered',
        tiers: [
          { upToVolume: 100_000, fee: { kind: 'flat', amount: 150 } },
          { upToVolume: null, fee: { kind: 'percent', rate: 0.001, min: 500 } },
        ],
      },
      'bis 1.000,00 € 1,50 €; darüber 0,10 %, mind. 5,00 €',
    ],
  ])('describes %o as „%s“', (model, expected) => {
    expect(plain(feeModelText(model))).toBe(expected);
  });
});

describe('accountFeeText', () => {
  it('names the waiver of a direct bank', () => {
    expect(plain(accountFeeText(DIRECT))).toBe(
      '0,00 € ab 700,00 € Geldeingang, sonst 5,40 € im Monat',
    );
  });

  it('names the monthly fee without a waiver, a free account and no current account', () => {
    expect(plain(accountFeeText({ ...DIRECT, monthlyFee: 1_110, feeWaiver: undefined }))).toBe(
      '11,10 € im Monat',
    );
    expect(accountFeeText({ ...DIRECT, monthlyFee: 0 })).toBe('kostenlos');
    expect(accountFeeText(null)).toBe('–');
  });
});

describe('overdraftText and savingsText', () => {
  it('names the overdraft rate with its surcharge', () => {
    expect(plain(overdraftText(DIRECT))).toBe('9,45 %, Aufschlag 4,50 Pp.');
    expect(overdraftText(null)).toBe('–');
  });

  it('names the savings rate with its payout', () => {
    expect(plain(savingsText({ rate: 0.023, payout: 'quarterly' }))).toBe('2,30 %, quartalsweise');
    expect(plain(savingsText({ rate: 0.018, payout: 'monthly' }))).toBe('1,80 %, monatlich');
    expect(savingsText(null)).toBe('–');
  });
});

describe('depot texts', () => {
  it('adds the exchange fee to the order fee', () => {
    expect(plain(orderFeeText(DEPOT))).toBe(
      '0,25 %, mind. 10,00 €, max. 60,00 € + 3,00 € Börsenentgelt',
    );
    expect(
      plain(orderFeeText({ ...DEPOT, orderFee: { kind: 'flat', amount: 90 }, exchangeFee: 0 })),
    ).toBe('0,90 €');
  });

  it('names the custody fee per year', () => {
    expect(custodyFeeText({ kind: 'none' })).toBe('kostenlos');
    expect(plain(custodyFeeText({ kind: 'percent-pa', rate: 0.0019, min: 2_810 }))).toBe(
      '0,19 % p. a., mind. 28,10 €',
    );
    expect(plain(custodyFeeText({ kind: 'flat-pa', amount: 5_000 }))).toBe('50,00 € p. a.');
  });

  it('names the clearing rates, the venue and fractional shares', () => {
    expect(plain(clearingText(DEPOT))).toBe('Haben 1,15 % · Soll 8,45 %');
    expect(venueText(DEPOT)).toBe('Börse');
    expect(plain(venueText({ ...DEPOT, venue: 'market-maker', spreadMarkup: 0.0012 }))).toBe(
      'Market Maker, Spread-Aufschlag 0,12 %',
    );
    expect(fractionalSharesText(DEPOT)).toBe('nein');
    expect(fractionalSharesText({ ...DEPOT, fractionalShares: true })).toBe('ja');
  });
});
