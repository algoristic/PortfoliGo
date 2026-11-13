import fc from 'fast-check';

import {
  bankFeesAccount,
  bankInterestAccount,
  bookTransaction,
  EMPLOYER_ACCOUNT,
  isPlayerAccount,
  issuerAccount,
  journalBalances,
  LIVING_COSTS_ACCOUNT,
  MARKET_ACCOUNT,
  OPENING_BALANCE_ACCOUNT,
  TAX_OFFICE_ACCOUNT,
} from './ledger-logic';
import { AccountId } from './models/account.model';
import {
  Balances,
  LedgerAccountId,
  PostingDraft,
  Transaction,
  TransactionDraft,
  TransactionType,
} from './models/ledger.model';

const ACC_1: AccountId = 'acc-1';
const ACC_2: AccountId = 'acc-2';
const TICK = 5_389_920;

const draft = (type: TransactionType, postings: PostingDraft[]): TransactionDraft => ({
  tick: TICK,
  type,
  postings,
});

describe('ledger-logic', () => {
  describe('external accounts', () => {
    // TS §7.2: counterparties outside the player's books
    it.each([
      [OPENING_BALANCE_ACCOUNT, 'external:opening-balance'],
      [EMPLOYER_ACCOUNT, 'external:employer'],
      [LIVING_COSTS_ACCOUNT, 'external:living-costs'],
      [TAX_OFFICE_ACCOUNT, 'external:tax-office'],
      [MARKET_ACCOUNT, 'external:market'],
      [bankFeesAccount('b3'), 'external:bank:b3:fees'],
      [bankInterestAccount('b3'), 'external:bank:b3:interest'],
      [issuerAccount('i7'), 'external:issuer:i7'],
    ])('names %s as %s', (account, expected) => {
      expect(account).toBe(expected);
      expect(isPlayerAccount(account)).toBe(false);
    });

    it('tells player accounts apart from external ones', () => {
      expect(isPlayerAccount(ACC_1)).toBe(true);
    });
  });

  describe('bookTransaction', () => {
    // TS §7.2: booking examples 1–6 with the balance after each posting
    const examples: [TransactionType, PostingDraft[], (number | null)[]][] = [
      [
        'opening-balance',
        [
          { account: ACC_1, amount: 1_000_000 },
          { account: OPENING_BALANCE_ACCOUNT, amount: -1_000_000 },
        ],
        [1_000_000, null],
      ],
      [
        'living-costs',
        [
          { account: ACC_1, amount: -184_327 },
          { account: LIVING_COSTS_ACCOUNT, amount: 184_327 },
        ],
        [815_673, null],
      ],
      [
        'transfer',
        [
          { account: ACC_1, amount: -300_000 },
          { account: ACC_2, amount: 300_000 },
        ],
        [515_673, 300_000],
      ],
      [
        'account-fee',
        [
          { account: ACC_1, amount: -990 },
          { account: bankFeesAccount('b1'), amount: 990 },
        ],
        [514_683, null],
      ],
      [
        'credit-interest',
        [
          { account: ACC_2, amount: 548 },
          { account: bankInterestAccount('b2'), amount: -548 },
        ],
        [300_548, null],
      ],
      [
        'salary',
        [
          { account: ACC_1, amount: 250_000 },
          { account: EMPLOYER_ACCOUNT, amount: -250_000 },
        ],
        [764_683, null],
      ],
    ];

    const bookExamples = (): { balances: Balances; journal: Transaction[] } => {
      const balances: Balances = new Map([
        [ACC_1, 0],
        [ACC_2, 0],
      ]);
      const journal = examples.map(([type, postings], i) =>
        bookTransaction(balances, i + 1, draft(type, postings)),
      );
      return { balances, journal };
    };

    it('books the examples with the balance after each posting', () => {
      const { balances, journal } = bookExamples();
      journal.forEach((transaction, i) => {
        const [type, postings, balancesAfter] = examples[i];
        expect(transaction).toEqual({
          seq: i + 1,
          tick: TICK,
          type,
          postings: postings.map((posting, j) => ({ ...posting, balanceAfter: balancesAfter[j] })),
        });
      });
      expect([...balances]).toEqual([
        [ACC_1, 764_683],
        [ACC_2, 300_548],
      ]);
    });

    it('sums the journal of the examples to the same balances', () => {
      const { journal } = bookExamples();
      expect([...journalBalances(journal)]).toEqual([
        [ACC_1, 764_683],
        [ACC_2, 300_548],
      ]);
    });

    it('keeps unit postings, references and text parameters', () => {
      const balances: Balances = new Map([[ACC_1, 200_000]]);
      const units = [{ depotId: 'dep-2' as const, instrumentId: 'c12', quantity: 10_000_000 }];
      const transaction = bookTransaction(balances, 9, {
        ...draft('buy', [
          { account: ACC_1, amount: -100_590 },
          { account: MARKET_ACCOUNT, amount: 100_000 },
          { account: bankFeesAccount('b3'), amount: 590 },
        ]),
        units,
        refs: { orderId: 'ord-4' },
        params: { month: 4 },
      });
      expect(transaction.units).toEqual(units);
      expect(transaction.refs).toEqual({ orderId: 'ord-4' });
      expect(transaction.params).toEqual({ month: 4 });
      expect(transaction.postings.map((posting) => posting.balanceAfter)).toEqual([
        99_410,
        null,
        null,
      ]);
    });

    it('gives each of two postings on the same account its running balance', () => {
      const balances: Balances = new Map([[ACC_1, 1_000]]);
      const transaction = bookTransaction(
        balances,
        1,
        draft('credit-interest', [
          { account: ACC_1, amount: 400 },
          { account: bankInterestAccount('b1'), amount: -400 },
          { account: ACC_1, amount: -100 },
          { account: TAX_OFFICE_ACCOUNT, amount: 100 },
        ]),
      );
      expect(transaction.postings.map((posting) => posting.balanceAfter)).toEqual([
        1_400,
        null,
        1_300,
        null,
      ]);
      expect(balances.get(ACC_1)).toBe(1_300);
    });

    const REJECTIONS: Record<string, string> = {
      'only one posting': 'transfer needs at least two postings',
      'no posting': 'transfer needs at least two postings',
      'a sum of −1 cent': 'postings of transfer sum to -1',
      'a sum of +1 cent': 'postings of transfer sum to 1',
      'half a cent': 'transfer books -0.5 on acc-1',
      'an unsafe integer': 'transfer books -9007199254740992 on acc-1',
      'an unknown account': 'transfer books on unknown account acc-9',
    };

    // TS §7.2: rejected transactions (balances as after example 6)
    it.each<[string, PostingDraft[]]>([
      ['only one posting', [{ account: ACC_1, amount: 100 }]],
      ['no posting', []],
      [
        'a sum of −1 cent',
        [
          { account: ACC_1, amount: -100 },
          { account: MARKET_ACCOUNT, amount: 99 },
        ],
      ],
      [
        'a sum of +1 cent',
        [
          { account: ACC_1, amount: -99 },
          { account: MARKET_ACCOUNT, amount: 100 },
        ],
      ],
      [
        'half a cent',
        [
          { account: ACC_1, amount: -0.5 },
          { account: MARKET_ACCOUNT, amount: 0.5 },
        ],
      ],
      [
        'an unsafe integer',
        [
          { account: ACC_1, amount: -(2 ** 53) },
          { account: MARKET_ACCOUNT, amount: 2 ** 53 },
        ],
      ],
      [
        'an unknown account',
        [
          { account: 'acc-9', amount: 100 },
          { account: EMPLOYER_ACCOUNT, amount: -100 },
        ],
      ],
    ])('rejects %s and leaves the balances unchanged', (reason, postings) => {
      const balances: Balances = new Map([
        [ACC_1, 764_683],
        [ACC_2, 300_548],
      ]);
      expect(() => bookTransaction(balances, 7, draft('transfer', postings))).toThrow(
        REJECTIONS[reason],
      );
      expect([...balances]).toEqual([
        [ACC_1, 764_683],
        [ACC_2, 300_548],
      ]);
    });
  });

  describe('properties', () => {
    const PLAYER_ACCOUNTS: AccountId[] = ['acc-1', 'acc-2', 'acc-3'];
    const COUNTERPARTIES: LedgerAccountId[] = [
      ...PLAYER_ACCOUNTS,
      MARKET_ACCOUNT,
      EMPLOYER_ACCOUNT,
    ];

    // Any balanced set of postings: free amounts plus one posting that balances them.
    const arbDraft = (): fc.Arbitrary<TransactionDraft> =>
      fc
        .tuple(
          fc.array(
            fc.record({
              account: fc.constantFrom(...COUNTERPARTIES),
              amount: fc.integer({ min: -1e9, max: 1e9 }),
            }),
            { minLength: 1, maxLength: 5 },
          ),
          fc.constantFrom(...COUNTERPARTIES),
        )
        .map(([postings, last]) =>
          draft('transfer', [
            ...postings,
            { account: last, amount: -postings.reduce((sum, { amount }) => sum + amount, 0) },
          ]),
        );

    const openAccounts = (): Balances =>
      new Map(PLAYER_ACCOUNTS.map((account): [AccountId, number] => [account, 0]));

    it('books postings that sum to zero and keeps the running balance', () => {
      fc.assert(
        fc.property(fc.array(arbDraft(), { maxLength: 20 }), (drafts) => {
          const balances = openAccounts();
          const running = new Map<LedgerAccountId, number>();
          const journal = drafts.map((transactionDraft, i) =>
            bookTransaction(balances, i + 1, transactionDraft),
          );
          for (const transaction of journal) {
            expect(transaction.postings.reduce((sum, { amount }) => sum + amount, 0)).toBe(0);
            for (const { account, amount, balanceAfter } of transaction.postings) {
              const next = (running.get(account) ?? 0) + amount;
              running.set(account, next);
              expect(balanceAfter).toBe(isPlayerAccount(account) ? next : null);
            }
          }
          const summed = journalBalances(journal);
          for (const account of PLAYER_ACCOUNTS) {
            expect(balances.get(account)).toBe(running.get(account) ?? 0);
            expect(summed.get(account) ?? 0).toBe(balances.get(account));
          }
        }),
      );
    });

    it('rejects every transaction whose postings do not sum to zero', () => {
      fc.assert(
        fc.property(
          arbDraft(),
          fc.integer({ min: -1e6, max: 1e6 }).filter((offset) => offset !== 0),
          (transactionDraft, offset) => {
            const [first, ...rest] = transactionDraft.postings;
            const unbalanced = {
              ...transactionDraft,
              postings: [{ ...first, amount: first.amount + offset }, ...rest],
            };
            const balances = openAccounts();
            expect(() => bookTransaction(balances, 1, unbalanced)).toThrow(RangeError);
            expect([...balances.values()]).toEqual([0, 0, 0]);
          },
        ),
      );
    });
  });
});
