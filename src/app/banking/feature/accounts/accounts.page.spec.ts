import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { firstValueFrom } from 'rxjs';

import { MINUTES_PER_HOUR } from '@app/clock/domain/models/time.model';
import { ClockFacade } from '@app/clock/feature/state/clock.facade';
import {
  generateMiniWorld,
  InProcessEngine,
  provideInProcessEngineWorker,
} from '@app/engine/data-access/testing/in-process-engine-worker';
import { FakePlayerLocks } from '@app/persistence/data-access/testing/fake-player-locks';
import { PlayersService } from '@app/players/data-access/service/players.service';
import { providePlayersTestPorts } from '@app/players/data-access/testing/fake-players-ports';
import { NewPlayer } from '@app/players/domain/models/player.model';
import { ShellPage } from '@app/shell/feature/shell/shell.page';
import { Bank } from '@app/world/domain/models/bank.model';

import {
  blur,
  byTestId,
  click,
  queryByTestId,
  select,
  textOf,
  typeText,
} from '../../../../testing/dom';
import { renderRoute, settle } from '../../../../testing/page';
import { MONTHLY_VALUES_THROTTLE_MS } from '../state/banking.effects';
import { BankingFacade } from '../state/banking.facade';

const MS_PER_MINUTE = 60_000;

const ANNA: NewPlayer = {
  name: 'Anna',
  seed: 'kupfer-falke-731',
  start: { startCapital: 1_000_000, netIncome: 250_000, livingCosts: 180_000 },
};

// The banks of the mini world of Anna's seed (public API of the in-process engine).
const BANKS = generateMiniWorld(ANNA.seed).world.banks;
const DIRECT_BANK = bankOfType('direct');
const NEO_BROKER = bankOfType('neo-broker');

function bankOfType(type: Bank['type']): Bank {
  const bank = BANKS.find((candidate) => candidate.type === type);
  if (bank === undefined) {
    throw new Error(`The mini world has no bank of type ${type}`);
  }
  return bank;
}

/** Tick of a game time given in UTC: game minutes since 01.01.2020, 00:00 (TS §3.2). */
function tickAt(utcMs: number): number {
  return (utcMs - Date.UTC(2020, 0, 1)) / MS_PER_MINUTE;
}

describe('AccountsPage', () => {
  let engine: InProcessEngine;
  let harness: RouterTestingHarness;
  let page: HTMLElement;

  beforeEach(async () => {
    localStorage.clear();
    const locks = new FakePlayerLocks();
    engine = new InProcessEngine({ storage: 'indexed-db', locks });
    harness = await renderRoute('/players', [
      provideInProcessEngineWorker(engine),
      providePlayersTestPorts({ locks }),
    ]);
    page = harness.fixture.nativeElement;
    const { profile } = await firstValueFrom(TestBed.inject(PlayersService).createPlayer(ANNA));
    await harness.navigateByUrl(`/game/${profile.id}/accounts`);
    await run(200);
  });

  async function run(ms: number): Promise<void> {
    await engine.advance(ms);
    await settle(harness.fixture);
  }

  async function act(action: () => void): Promise<void> {
    action();
    await settle(harness.fixture);
  }

  /** Dialogs render in an overlay outside the page. */
  function body<T extends HTMLElement = HTMLElement>(testId: string): T {
    return byTestId<T>(document.body, testId);
  }

  function card(accountId: string): HTMLElement {
    return byTestId(page, `banking.accounts.card.${accountId}`);
  }

  function cardText(accountId: string, part: string): string {
    return textOf(byTestId(card(accountId), `banking.accounts.card.${part}`));
  }

  function openCardIds(): string[] {
    const open = page.querySelector('[aria-labelledby="banking-accounts-open"]');
    return [...(open?.querySelectorAll('[data-testid^="banking.accounts.card.acc-"]') ?? [])].map(
      (element) => element.getAttribute('data-testid')?.replace('banking.accounts.card.', '') ?? '',
    );
  }

  /** Facades of the game area are provided at the shell route. */
  function gameFacade<T>(token: new (...args: never[]) => T): T {
    return harness.fixture.debugElement.query(By.directive(ShellPage)).injector.get(token);
  }

  /** Opens an account without the dialog, as setup for other flows. */
  async function openAccount(bank: Bank, kind: 'current' | 'savings'): Promise<void> {
    gameFacade(BankingFacade).openAccount(bank.id, kind);
    await run(100);
  }

  async function chooseOpenAccount(bank: Bank, kind: string): Promise<void> {
    await act(() => click(byTestId(page, 'banking.accounts.open-account')));
    await act(() => select(body<HTMLSelectElement>('banking.open-account-dialog.bank'), bank.id));
    await act(() => click(body(`banking.open-account-dialog.kind.${kind}`)));
  }

  describe('overview', () => {
    it('shows the salary account with the start capital and the totals', () => {
      // A new player has one current account at the home bank with the start capital (TS §7.2).
      expect(cardText('acc-1', 'kind')).toBe('Girokonto');
      expect(cardText('acc-1', 'balance')).toBe('10.000,00 €');
      expect(queryByTestId(card('acc-1'), 'banking.accounts.card.salary')).not.toBeNull();
      expect(cardText('acc-1', 'bank')).toBe(BANKS[0].name);
      expect(textOf(byTestId(page, 'banking.accounts.totals.total'))).toContain('10.000,00 €');
      expect(textOf(byTestId(page, 'banking.accounts.totals.current'))).toContain('10.000,00 €');
      expect(textOf(byTestId(page, 'banking.accounts.totals.savings'))).toContain('0,00 €');
      expect(queryByTestId(page, 'banking.accounts.closed')).toBeNull();
      // One account: nothing to transfer to, and the salary account offers no switch.
      expect(queryByTestId(page, 'banking.accounts.transfer')).toBeNull();
      expect(queryByTestId(card('acc-1'), 'banking.accounts.card.salary-account')).toBeNull();
    });

    it('opens the statement of an account and links to the bank comparison', async () => {
      click(byTestId(page, 'banking.accounts.card.statement'));
      await settle(harness.fixture);
      expect(TestBed.inject(Router).url).toMatch(/\/accounts\/acc-1$/);
      expect(document.title).toBe('Kontoauszug · PortfoliGo');

      await harness.navigateByUrl(TestBed.inject(Router).url.replace(/\/acc-1$/, ''));
      await act(() => click(byTestId(page, 'banking.accounts.banks')));
      expect(TestBed.inject(Router).url).toMatch(/\/banks$/);
    });
  });

  describe('open account', () => {
    it('opens a savings account at a direct bank after showing its conditions', async () => {
      await chooseOpenAccount(DIRECT_BANK, 'savings');
      // PS §10.1: the conditions of the kind before opening. 2,30 % quarterly is the savings
      // account of the first direct bank of this seed.
      expect(DIRECT_BANK.conditions.savingsAccount).toEqual({ rate: 0.023, payout: 'quarterly' });
      expect(textOf(body('banking.open-account-dialog.conditions.savings-rate'))).toBe('2,30 %');
      expect(textOf(body('banking.open-account-dialog.conditions.payout'))).toBe('quartalsweise');

      await act(() => click(body('banking.open-account-dialog.submit')));
      expect(queryByTestId(document.body, 'banking.open-account-dialog.submit')).toBeNull();
      await run(100);
      expect(cardText('acc-2', 'kind')).toBe('Tagesgeld');
      expect(cardText('acc-2', 'bank')).toBe(DIRECT_BANK.name);
      expect(cardText('acc-2', 'balance')).toBe('0,00 €');
    });

    it('offers only a depot at a neo broker and opens it with its clearing account', async () => {
      await chooseOpenAccount(NEO_BROKER, 'depot');
      expect(queryByTestId(document.body, 'banking.open-account-dialog.kind.current')).toBeNull();
      expect(queryByTestId(document.body, 'banking.open-account-dialog.kind.savings')).toBeNull();
      expect(textOf(body('banking.open-account-dialog.conditions.fractional'))).toBe('ja');

      await act(() => click(body('banking.open-account-dialog.submit')));
      await run(100);
      const ids = openCardIds();
      expect(ids).toHaveLength(2);
      const clearing = ids.find((id) => id !== 'acc-1') ?? '';
      expect(cardText(clearing, 'kind')).toBe('Verrechnungskonto');
      expect(cardText(clearing, 'bank')).toBe(NEO_BROKER.name);
    });

    it('asks for a kind the bank offers after switching to a broker', async () => {
      await act(() => click(byTestId(page, 'banking.accounts.open-account')));
      // Preselected: the bank of the salary account with its first kind.
      expect(body<HTMLSelectElement>('banking.open-account-dialog.bank').value).toBe(BANKS[0].id);
      expect(body<HTMLInputElement>('banking.open-account-dialog.kind.current').checked).toBe(true);

      await act(() =>
        select(body<HTMLSelectElement>('banking.open-account-dialog.bank'), NEO_BROKER.id),
      );
      await act(() => click(body('banking.open-account-dialog.submit')));
      expect(textOf(body('banking.open-account-dialog.kind-error'))).toBe(
        'Bitte wähle eine Kontoart, die diese Bank anbietet.',
      );
      await act(() => click(body('banking.open-account-dialog.decline')));
      await run(100);
      expect(openCardIds()).toEqual(['acc-1']);
    });
  });

  describe('transfer', () => {
    beforeEach(async () => {
      await openAccount(DIRECT_BANK, 'savings');
    });

    it('rejects more than the available amount at the field, then transfers', async () => {
      await act(() => click(byTestId(page, 'banking.accounts.transfer')));
      // From the salary account to the only other account.
      expect(body<HTMLSelectElement>('banking.transfer-dialog.from').value).toBe('acc-1');
      expect(body<HTMLSelectElement>('banking.transfer-dialog.to').value).toBe('acc-2');
      // US-BK-04: balance plus free overdraft; the home bank starts with 2 × 2.500 € (TS §7.4).
      expect(textOf(body('banking.transfer-dialog.available'))).toBe('Verfügbar: 15.000,00 €');

      const amount = body<HTMLInputElement>('banking.transfer-dialog.amount');
      await act(() => typeText(amount, '15.000,01'));
      await act(() => blur(amount));
      await act(() => click(body('banking.transfer-dialog.submit')));
      expect(textOf(body('banking.transfer-dialog.amount-error'))).toBe(
        'Du kannst höchstens 15.000,00 € überweisen.',
      );

      await act(() => typeText(amount, '1.234,56'));
      await act(() =>
        typeText(body<HTMLInputElement>('banking.transfer-dialog.purpose'), 'Urlaub'),
      );
      await act(() => click(body('banking.transfer-dialog.submit')));
      expect(queryByTestId(document.body, 'banking.transfer-dialog.submit')).toBeNull();
      await run(100);
      expect(cardText('acc-1', 'balance')).toBe('8.765,44 €');
      expect(cardText('acc-2', 'balance')).toBe('1.234,56 €');
    });

    it('starts from the account of the card', async () => {
      await act(() => click(byTestId(card('acc-2'), 'banking.accounts.card.transfer')));
      expect(body<HTMLSelectElement>('banking.transfer-dialog.from').value).toBe('acc-2');
      expect(textOf(body('banking.transfer-dialog.available'))).toBe('Verfügbar: 0,00 €');
      await act(() => click(body('banking.transfer-dialog.decline')));
    });
  });

  describe('close account', () => {
    it('shows the settlement and sends the remainder to the chosen account', async () => {
      await openAccount(DIRECT_BANK, 'savings');
      gameFacade(BankingFacade).transfer({
        fromAccountId: 'acc-1',
        toAccountId: 'acc-2',
        amount: 100_000,
        purpose: '',
      });
      await run(100);

      await act(() => click(byTestId(card('acc-2'), 'banking.accounts.card.close')));
      // Opened and closed at the same paused moment: no interest, no fee (TS §7.4).
      expect(textOf(body('banking.close-account-dialog.balance'))).toBe('1.000,00 €');
      expect(
        queryByTestId(document.body, 'banking.close-account-dialog.no-bookings'),
      ).not.toBeNull();
      expect(textOf(body('banking.close-account-dialog.remainder'))).toBe('1.000,00 €');
      expect(body<HTMLSelectElement>('banking.close-account-dialog.target').value).toBe('acc-1');

      await act(() => click(body('banking.close-account-dialog.submit')));
      await run(100);
      expect(openCardIds()).toEqual(['acc-1']);
      expect(cardText('acc-1', 'balance')).toBe('10.000,00 €');
      expect(textOf(byTestId(page, 'banking.accounts.closed.toggle'))).toBe(
        'Geschlossene Konten (1)',
      );
    });

    it('explains why the salary account cannot close and blocks confirming', async () => {
      await act(() => click(byTestId(card('acc-1'), 'banking.accounts.card.close')));
      expect(textOf(body('banking.close-account-dialog.blocker.salary-account'))).toBe(
        'Das Gehaltskonto lässt sich erst schließen, wenn du ein anderes Girokonto als Gehaltskonto gewählt hast.',
      );
      expect(body<HTMLButtonElement>('banking.close-account-dialog.submit').disabled).toBe(true);
      await act(() => click(body('banking.close-account-dialog.decline')));
      expect(openCardIds()).toEqual(['acc-1']);
    });
  });

  describe('salary account', () => {
    it('moves the salary account to another current account', async () => {
      await openAccount(DIRECT_BANK, 'current');
      await act(() => click(byTestId(card('acc-2'), 'banking.accounts.card.salary-account')));
      expect(body<HTMLInputElement>('banking.salary-account-dialog.account.acc-2').checked).toBe(
        true,
      );
      expect(textOf(body('banking.salary-account-dialog.hint'))).toContain(
        'Bei der neuen Bank wächst er über drei Monate, bei der bisherigen schrumpft er.',
      );

      await act(() => click(body('banking.salary-account-dialog.submit')));
      await run(100);
      expect(queryByTestId(card('acc-2'), 'banking.accounts.card.salary')).not.toBeNull();
      expect(queryByTestId(card('acc-1'), 'banking.accounts.card.salary')).toBeNull();
      // The salary account comes first in the overview (AP 3.4).
      expect(openCardIds()).toEqual(['acc-2', 'acc-1']);
    });
  });

  describe('monthly overview', () => {
    function rowIds(): string[] {
      return [...page.querySelectorAll('[data-testid^="banking.monthly.row.20"]')].map(
        (row) => row.getAttribute('data-testid')?.replace('banking.monthly.row.', '') ?? '',
      );
    }

    function cell(month: string, column: string): string {
      return textOf(
        byTestId(byTestId(page, `banking.monthly.row.${month}`), `banking.monthly.row.${column}`),
      );
    }

    function clock(): string {
      return textOf(byTestId(page, 'shell.header.clock'));
    }

    it('shows the running month and, after the month ends, April with the income', async () => {
      await act(() => click(byTestId(page, 'banking.accounts.tabs.months.tab')));
      expect(rowIds()).toEqual(['2030-04']);
      expect(cell('2030-04', 'month')).toBe('April 2030');
      expect(queryByTestId(page, 'banking.monthly.row.running')).not.toBeNull();
      // Nothing earned yet: no savings rate (US-EK-03).
      expect(cell('2030-04', 'savings-rate')).toBe('–');

      // Past the salary of 30.04. and the month end, to 01.05.2030, 07:00.
      gameFacade(ClockFacade).jumpTo({ kind: 'date', tick: tickAt(Date.UTC(2030, 4, 1, 7)) });
      for (let pass = 0; pass < 100 && !clock().endsWith('07:00'); pass++) {
        await run(MINUTES_PER_HOUR);
      }
      expect(clock()).toBe('Mi., 01.05.2030, 07:00');
      // The last trigger of the throttled loads arrives after the throttle time.
      await new Promise((resolve) => setTimeout(resolve, MONTHLY_VALUES_THROTTLE_MS + 50));
      await run(100);

      expect(rowIds()).toEqual(['2030-05', '2030-04']);
      const april = byTestId(page, 'banking.monthly.row.2030-04');
      expect(queryByTestId(april, 'banking.monthly.row.running')).toBeNull();
      expect(cell('2030-04', 'income')).toBe('2.500,00 €');
      expect(cell('2030-04', 'dividends')).toBe('0,00 €');
      expect(cell('2030-04', 'savings-rate')).not.toBe('–');
      expect(
        queryByTestId(byTestId(page, 'banking.monthly.row.2030-05'), 'banking.monthly.row.running'),
      ).not.toBeNull();
    });
  });
});
