import fc from 'fast-check';

import { dateTimeToTick } from '@app/clock/domain/calendar-logic';

import { bookTransaction } from './ledger-logic';
import { Account, AccountId } from './models/account.model';
import {
  Balances,
  LedgerAccountId,
  Transaction,
  TRANSACTION_TYPES,
  TransactionType,
} from './models/ledger.model';
import { StatementContext, StatementFilter } from './models/statement.model';
import { mergeJournal, statementPage } from './statement-logic';

const at = (day: number, month: number, hour = 0, minute = 0): number =>
  dateTimeToTick({ year: 2030, month, day, hour, minute });

function account(id: AccountId, kind: Account['kind'], bankId: string, number: string): Account {
  return { id, kind, bankId, number, openedAt: at(1, 4), closedAt: null } as Account;
}

// TS §7.2, statement: journal 1–6 with ticks plus transfer 7, banks b1 „Hansebank“ and b2
const ACCOUNTS: Account[] = [
  account('acc-1', 'current', 'b1', '0000000001'),
  account('acc-2', 'savings', 'b2', '0000000002'),
];
const BANK_NAMES = new Map([
  ['b1', 'Hansebank'],
  ['b2', 'Direktbank Süd'],
]);
const JOURNAL: Transaction[] = [
  {
    seq: 1,
    tick: at(1, 4),
    type: 'opening-balance',
    postings: [
      { account: 'acc-1', amount: 1_000_000, balanceAfter: 1_000_000 },
      { account: 'external:opening-balance', amount: -1_000_000, balanceAfter: null },
    ],
  },
  {
    seq: 2,
    tick: at(1, 4, 6),
    type: 'living-costs',
    postings: [
      { account: 'acc-1', amount: -184_327, balanceAfter: 815_673 },
      { account: 'external:living-costs', amount: 184_327, balanceAfter: null },
    ],
    params: { month: '2030-04' },
  },
  {
    seq: 3,
    tick: at(2, 4, 10, 15),
    type: 'transfer',
    postings: [
      { account: 'acc-1', amount: -300_000, balanceAfter: 515_673 },
      { account: 'acc-2', amount: 300_000, balanceAfter: 300_000 },
    ],
    params: { purpose: 'Notgroschen' },
  },
  {
    seq: 4,
    tick: at(30, 4, 6),
    type: 'account-fee',
    postings: [
      { account: 'acc-1', amount: -990, balanceAfter: 514_683 },
      { account: 'external:bank:b1:fees', amount: 990, balanceAfter: null },
    ],
    params: { month: '2030-04' },
  },
  {
    seq: 5,
    tick: at(30, 4, 6),
    type: 'credit-interest',
    postings: [
      { account: 'acc-2', amount: 548, balanceAfter: 300_548 },
      { account: 'external:bank:b2:interest', amount: -548, balanceAfter: null },
    ],
    params: { from: at(1, 4), to: at(30, 4) },
  },
  {
    seq: 6,
    tick: at(30, 4, 6),
    type: 'salary',
    postings: [
      { account: 'acc-1', amount: 250_000, balanceAfter: 764_683 },
      { account: 'external:employer', amount: -250_000, balanceAfter: null },
    ],
    params: { month: '2030-04' },
  },
  {
    seq: 7,
    tick: at(3, 5, 12),
    type: 'transfer',
    postings: [
      { account: 'acc-2', amount: -125_000, balanceAfter: 175_548 },
      { account: 'acc-1', amount: 125_000, balanceAfter: 889_683 },
    ],
    params: { purpose: 'Urlaub Mai' },
  },
];

const context = (accountId: AccountId): StatementContext => ({
  accountId,
  accounts: ACCOUNTS,
  bankNames: BANK_NAMES,
});
const ALL = { offset: 0, limit: 200 };

describe('statement-logic', () => {
  describe('statementPage', () => {
    // TS §7.2, statement: entries of acc-1 and acc-2
    it('turns the transactions of an account into entries, newest first', () => {
      const acc1 = statementPage(JOURNAL, context('acc-1'), {}, ALL);
      expect(acc1.total).toBe(6);
      expect(
        acc1.entries.map(({ seq, amount, balanceAfter }) => [seq, amount, balanceAfter]),
      ).toEqual([
        [7, 125_000, 889_683],
        [6, 250_000, 764_683],
        [4, -990, 514_683],
        [3, -300_000, 515_673],
        [2, -184_327, 815_673],
        [1, 1_000_000, 1_000_000],
      ]);
      expect(acc1.entries[0]).toEqual({
        seq: 7,
        tick: at(3, 5, 12),
        type: 'transfer',
        amount: 125_000,
        balanceAfter: 889_683,
        counterparties: [
          {
            kind: 'own',
            accountId: 'acc-2',
            accountKind: 'savings',
            bankId: 'b2',
            number: '0000000002',
          },
        ],
        params: { purpose: 'Urlaub Mai' },
        refs: {},
      });
      expect(acc1.entries[2].counterparties).toEqual([
        { kind: 'external', account: 'external:bank:b1:fees', bankId: 'b1' },
      ]);
      expect(acc1.entries[4]).toMatchObject({
        counterparties: [{ kind: 'external', account: 'external:living-costs', bankId: null }],
        params: { month: '2030-04' },
      });

      const acc2 = statementPage(JOURNAL, context('acc-2'), {}, ALL);
      expect(
        acc2.entries.map(({ seq, amount, balanceAfter }) => [seq, amount, balanceAfter]),
      ).toEqual([
        [7, -125_000, 175_548],
        [5, 548, 300_548],
        [3, 300_000, 300_000],
      ]);
      expect(acc2.entries[2].counterparties).toEqual([
        {
          kind: 'own',
          accountId: 'acc-1',
          accountKind: 'current',
          bankId: 'b1',
          number: '0000000001',
        },
      ]);
      expect(acc2.entries[1].counterparties).toEqual([
        { kind: 'external', account: 'external:bank:b2:interest', bankId: 'b2' },
      ]);
    });

    // TS §7.2, statement: matches in the statement of acc-1
    it.each<[string, StatementFilter, { offset: number; limit: number }, number[], number]>([
      ['no filter', {}, ALL, [7, 6, 4, 3, 2, 1], 6],
      ['a page', {}, { offset: 2, limit: 2 }, [4, 3], 6],
      ['a page after the end', {}, { offset: 6, limit: 10 }, [], 6],
      ['a type', { types: ['transfer'] }, ALL, [7, 3], 2],
      ['two types', { types: ['salary', 'account-fee'] }, ALL, [6, 4], 2],
      ['a period', { from: at(2, 4, 10, 15), to: at(30, 4, 6) }, ALL, [6, 4, 3], 3],
      ['an end only', { to: at(1, 4, 5, 59) }, ALL, [1], 1],
      ['a start and a type', { from: at(1, 5), types: ['salary'] }, ALL, [], 0],
      ['a purpose', { search: 'notgroschen' }, ALL, [3], 1],
      ['a purpose in other case', { search: ' URLAUB ' }, ALL, [7], 1],
      ['the bank of an own account', { search: 'direktbank' }, ALL, [7, 3], 2],
      ['the bank of a fee', { search: 'hansebank' }, ALL, [4], 1],
      ['an account number', { search: '0000000002' }, ALL, [7, 3], 2],
      ['part of an account number', { search: '2' }, ALL, [7, 3], 2],
      ['whole euros', { search: '1.250' }, ALL, [7], 1],
      ['cents', { search: '1250,00' }, ALL, [7], 1],
      ['other cents', { search: '1250,5' }, ALL, [], 0],
      ['the euros of 9,90 €', { search: '9' }, ALL, [4], 1],
      ['one decimal place', { search: '9,9' }, ALL, [4], 1],
      ['other decimal places', { search: '9,99' }, ALL, [], 0],
      ['an unsigned debit', { search: '1.843,27' }, ALL, [2], 1],
      ['a signed debit', { search: '−1.843' }, ALL, [2], 1],
      ['a signed credit', { search: '-2.500' }, ALL, [], 0],
      ['an amount with currency', { search: '2.500 €' }, ALL, [6], 1],
      ['an amount and a type', { search: '10.000', types: ['opening-balance'] }, ALL, [1], 1],
      ['a text of the UI', { search: 'gehalt' }, ALL, [], 0],
    ])('finds %s', (_name, filter, page, seqs, total) => {
      const result = statementPage(JOURNAL, context('acc-1'), filter, page);
      expect(result.entries.map(({ seq }) => seq)).toEqual(seqs);
      expect(result.total).toBe(total);
    });

    it('treats an empty type list and a blank search as no filter', () => {
      const result = statementPage(JOURNAL, context('acc-1'), { types: [], search: '  ' }, ALL);
      expect(result.total).toBe(6);
    });

    it('reads an account without transactions as empty', () => {
      const accounts = [...ACCOUNTS, account('acc-3', 'current', 'b2', '0000000003')];
      expect(statementPage(JOURNAL, { ...context('acc-3'), accounts }, {}, ALL)).toEqual({
        total: 0,
        entries: [],
      });
    });

    it('sums two postings of one transaction on the account', () => {
      const journal: Transaction[] = [
        {
          seq: 1,
          tick: at(1, 4),
          type: 'account-fee',
          postings: [
            { account: 'acc-1', amount: -500, balanceAfter: -500 },
            { account: 'external:bank:b1:fees', amount: 500, balanceAfter: null },
            { account: 'acc-1', amount: -300, balanceAfter: -800 },
            { account: 'external:bank:b1:fees', amount: 300, balanceAfter: null },
          ],
          refs: { closedAccountId: 'acc-1' },
        },
      ];
      const [entry] = statementPage(journal, context('acc-1'), {}, ALL).entries;
      expect(entry).toMatchObject({
        amount: -800,
        balanceAfter: -800,
        refs: { closedAccountId: 'acc-1' },
      });
      expect(entry.counterparties).toHaveLength(1);
    });
    // TS §7.2, statement: amounts below 1 € with and without a sign
    it.each([
      ['0', [2, 1]],
      ['0,5', [1]],
      ['-0,50', [1]],
      ['−0', [2, 1]],
      ['0,25', [2]],
    ])('finds %s among amounts below one euro', (search, seqs) => {
      const journal: Transaction[] = [
        {
          seq: 1,
          tick: at(1, 4),
          type: 'account-fee',
          postings: [
            { account: 'acc-1', amount: -50, balanceAfter: -50 },
            { account: 'external:bank:b1:fees', amount: 50, balanceAfter: null },
          ],
        },
        {
          seq: 2,
          tick: at(1, 4),
          type: 'credit-interest',
          postings: [
            { account: 'acc-1', amount: 25, balanceAfter: -25 },
            { account: 'external:bank:b1:interest', amount: -25, balanceAfter: null },
          ],
        },
      ];
      const result = statementPage(journal, context('acc-1'), { search }, ALL);
      expect(result.entries.map(({ seq }) => seq)).toEqual(seqs);
    });

    // TS §7.2: the name of the security of a booking (`refs.instrumentId`) is searchable
    it('finds bookings by the name of their security', () => {
      const booking = (seq: number, instrumentId: string): Transaction => ({
        seq,
        tick: at(1, 4),
        type: 'dividend',
        postings: [
          { account: 'acc-1', amount: 1_000, balanceAfter: 1_000 * seq },
          { account: `external:issuer:${instrumentId}`, amount: -1_000, balanceAfter: null },
        ],
        refs: { instrumentId },
      });
      const journal = [booking(1, 'stk-1'), booking(2, 'stk-2'), booking(3, 'stk-9')];
      const instrumentNames = new Map([
        ['stk-1', 'Astix AG'],
        ['stk-2', 'Borealis SE'],
      ]);
      const search = (text: string) =>
        statementPage(
          journal,
          { ...context('acc-1'), instrumentNames },
          { search: text },
          ALL,
        ).entries.map(({ seq }) => seq);
      expect(search('astix')).toEqual([1]);
      expect(search(' SE ')).toEqual([2]);
      expect(search('stk-9')).toEqual([]);
      expect(statementPage(journal, context('acc-1'), { search: 'astix' }, ALL).entries).toEqual(
        [],
      );
    });

    // TS §7.2: purchase example, every other account is a counterparty and searchable
    it('lists and searches every counterparty of a purchase', () => {
      const journal: Transaction[] = [
        {
          seq: 1,
          tick: at(1, 4),
          type: 'buy',
          postings: [
            { account: 'acc-1', amount: -100_590, balanceAfter: -100_590 },
            { account: 'external:market', amount: 100_000, balanceAfter: null },
            { account: 'external:bank:b1:fees', amount: 590, balanceAfter: null },
          ],
        },
      ];
      const result = statementPage(journal, context('acc-1'), { search: 'hanse' }, ALL);
      expect(result.entries.map(({ counterparties }) => counterparties)).toEqual([
        [
          { kind: 'external', account: 'external:market', bankId: null },
          { kind: 'external', account: 'external:bank:b1:fees', bankId: 'b1' },
        ],
      ]);
    });

    it('fails for a transaction on an account the context lacks', () => {
      expect(() =>
        statementPage(JOURNAL, { ...context('acc-1'), accounts: [ACCOUNTS[0]] }, {}, ALL),
      ).toThrow(RangeError);
    });
  });

  describe('mergeJournal', () => {
    it('keeps each running number once, in journal order, the later source winning', () => {
      const [t1, t2, t3, t4] = JOURNAL;
      const newer = { ...t3, params: { purpose: 'neu' } };
      expect(mergeJournal([t1, t3, t2], [newer, t4])).toEqual([t1, t2, newer, t4]);
      expect(mergeJournal([], [])).toEqual([]);
    });
  });

  describe('properties', () => {
    const PLAYER: AccountId[] = ['acc-1', 'acc-2', 'acc-3'];
    const EXTERNAL: LedgerAccountId[] = [
      'external:employer',
      'external:living-costs',
      'external:bank:b1:fees',
      'external:bank:b2:interest',
      'external:market',
    ];
    const accounts = PLAYER.map((id, n) =>
      account(id, 'current', `b${n + 1}`, `000000000${n + 1}`),
    );

    const arbDraft = fc.record({
      gap: fc.integer({ min: 0, max: 3 }),
      type: fc.constantFrom(...TRANSACTION_TYPES),
      from: fc.constantFrom<LedgerAccountId>(...PLAYER, ...EXTERNAL),
      to: fc.constantFrom<LedgerAccountId>(...PLAYER, ...EXTERNAL),
      amount: fc.integer({ min: 1, max: 1_000_000 }),
      purpose: fc.option(fc.constantFrom('Miete', 'Urlaub', 'Rücklage 2030'), { nil: undefined }),
    });
    const arbJournal = fc.array(arbDraft, { maxLength: 40 }).map((drafts) => {
      const balances: Balances = new Map(PLAYER.map((id) => [id, 0]));
      let tick = at(1, 4);
      return drafts
        .filter(({ from, to }) => from !== to)
        .map((draft, n) => {
          tick += draft.gap;
          return bookTransaction(balances, n + 1, {
            tick,
            type: draft.type,
            postings: [
              { account: draft.from, amount: -draft.amount },
              { account: draft.to, amount: draft.amount },
            ],
            ...(draft.purpose === undefined ? {} : { params: { purpose: draft.purpose } }),
          });
        });
    });
    const arbFilter: fc.Arbitrary<StatementFilter> = fc.record(
      {
        from: fc.integer({ min: at(1, 4), max: at(1, 4) + 120 }),
        to: fc.integer({ min: at(1, 4), max: at(1, 4) + 120 }),
        types: fc.subarray([...TRANSACTION_TYPES]),
        search: fc.constantFrom('urlaub', 'b', '00002', '1', '10,00', '-5', 'x'),
      },
      { requiredKeys: [] },
    );
    const ctx = (accountId: AccountId): StatementContext => ({
      accountId,
      accounts,
      bankNames: new Map([
        ['b1', 'Alpha Bank'],
        ['b2', 'Beta Bank'],
        ['b3', 'Gamma'],
      ]),
    });
    const all = (journal: readonly Transaction[], accountId: AccountId, filter: StatementFilter) =>
      statementPage(journal, ctx(accountId), filter, { offset: 0, limit: journal.length });

    it('yields the filtered list when its pages are put together', () => {
      fc.assert(
        fc.property(
          arbJournal,
          fc.constantFrom(...PLAYER),
          arbFilter,
          fc.integer({ min: 1, max: 7 }),
          (journal, accountId, filter, limit) => {
            const full = all(journal, accountId, filter);
            const pages: number[] = [];
            for (let offset = 0; offset < full.total + limit; offset += limit) {
              const page = statementPage(journal, ctx(accountId), filter, { offset, limit });
              expect(page.total).toBe(full.total);
              expect(page.entries.length).toBeLessThanOrEqual(limit);
              pages.push(...page.entries.map(({ seq }) => seq));
            }
            expect(pages).toEqual(full.entries.map(({ seq }) => seq));
          },
        ),
      );
    });

    it('counts all matches as the total', () => {
      fc.assert(
        fc.property(
          arbJournal,
          fc.constantFrom(...PLAYER),
          arbFilter,
          (journal, accountId, filter) => {
            const full = all(journal, accountId, filter);
            expect(full.total).toBe(full.entries.length);
          },
        ),
      );
    });

    it('keeps the order of the unfiltered statement and selects by period and type', () => {
      fc.assert(
        fc.property(
          arbJournal,
          fc.constantFrom(...PLAYER),
          arbFilter,
          (journal, accountId, { search, ...filter }) => {
            const unfiltered = all(journal, accountId, {}).entries;
            const types = new Set<TransactionType>(
              filter.types?.length ? filter.types : TRANSACTION_TYPES,
            );
            const expected = unfiltered.filter(
              ({ tick, type }) =>
                tick >= (filter.from ?? -Infinity) &&
                tick <= (filter.to ?? Infinity) &&
                types.has(type),
            );
            expect(all(journal, accountId, filter).entries).toEqual(expected);
            const searched = all(journal, accountId, { ...filter, search }).entries;
            const seqs = expected.map(({ seq }) => seq);
            const positions = searched.map(({ seq }) => seqs.indexOf(seq));
            expect(positions.every((position) => position >= 0)).toBe(true);
            expect(positions).toEqual([...positions].sort((a, b) => a - b));
          },
        ),
      );
    });

    it('shows the running balance as the balance after each entry', () => {
      fc.assert(
        fc.property(arbJournal, fc.constantFrom(...PLAYER), (journal, accountId) => {
          let running = 0;
          for (const entry of all(journal, accountId, {}).entries.reverse()) {
            running += entry.amount;
            expect(entry.balanceAfter).toBe(running);
          }
        }),
      );
    });
  });
});
