import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { filter, firstValueFrom } from 'rxjs';

import { MINUTES_PER_HOUR } from '@app/clock/domain/models/time.model';
import { ClockFacade } from '@app/clock/feature/state/clock.facade';
import {
  InProcessEngine,
  provideInProcessEngineWorker,
} from '@app/engine/data-access/testing/in-process-engine-worker';
import { FakePlayerLocks } from '@app/persistence/data-access/testing/fake-player-locks';
import { PlayersService } from '@app/players/data-access/service/players.service';
import { providePlayersTestPorts } from '@app/players/data-access/testing/fake-players-ports';
import { NewPlayer } from '@app/players/domain/models/player.model';
import { ShellPage } from '@app/shell/feature/shell/shell.page';
import { Bank } from '@app/world/domain/models/bank.model';

import { byTestId, click, queryByTestId, select, textOf, typeText } from '../../../../testing/dom';
import { renderRoute, settle } from '../../../../testing/page';
import { installScrollViewport, scrollTo } from '../../../../testing/scroll-viewport';
import { STATEMENT_SEARCH_DEBOUNCE_MS } from '../state/banking.effects';
import { BankingFacade } from '../state/banking.facade';

const MS_PER_MINUTE = 60_000;
const ROW_HEIGHT_PX = 64;
const VIEWPORT_HEIGHT_PX = 512;

const ANNA: NewPlayer = {
  name: 'Anna',
  seed: 'kupfer-falke-731',
  start: { startCapital: 1_000_000, netIncome: 250_000, livingCosts: 180_000 },
};

/** Tick of a game time given in UTC: game minutes since 01.01.2020, 00:00 (TS §3.2). */
function tickAt(utcMs: number): number {
  return (utcMs - Date.UTC(2020, 0, 1)) / MS_PER_MINUTE;
}

describe('AccountStatementPage', () => {
  let engine: InProcessEngine;
  let harness: RouterTestingHarness;
  let page: HTMLElement;
  let playerId: string;
  let restoreViewport: () => void;
  let savingsBank: Bank | undefined;

  beforeEach(async () => {
    localStorage.clear();
    restoreViewport = installScrollViewport(VIEWPORT_HEIGHT_PX);
    const locks = new FakePlayerLocks();
    engine = new InProcessEngine({ storage: 'indexed-db', locks });
    harness = await renderRoute('/players', [
      provideInProcessEngineWorker(engine),
      providePlayersTestPorts({ locks }),
    ]);
    page = harness.fixture.nativeElement;
    const { profile } = await firstValueFrom(TestBed.inject(PlayersService).createPlayer(ANNA));
    playerId = profile.id;
  });

  afterEach(() => restoreViewport());

  async function open(url: string): Promise<void> {
    await harness.navigateByUrl(`/game/${playerId}/${url}`);
    await run(200);
  }

  async function run(ms: number): Promise<void> {
    await engine.advance(ms);
    await settle(harness.fixture);
  }

  /** Facades of the game area are provided at the shell route. */
  function gameFacade<T>(token: new (...args: never[]) => T): T {
    return harness.fixture.debugElement.query(By.directive(ShellPage)).injector.get(token);
  }

  /** Jumps to 01.04.2030, 07:00, after the bank run of the first bank working day (E-19). */
  async function jumpPastBankRun(): Promise<void> {
    gameFacade(ClockFacade).jumpTo({
      kind: 'date',
      tick: tickAt(Date.UTC(2030, 3, 1, 7)),
    });
    for (let pass = 0; pass < 50 && !clock().endsWith('07:00'); pass++) {
      await run(MINUTES_PER_HOUR);
    }
    expect(clock()).toBe('Mo., 01.04.2030, 07:00');
  }

  /** Opens a savings account and transfers `count` times to it, every purpose its own. */
  async function transferToSavings(count: number, purpose: (n: number) => string): Promise<void> {
    const banking = gameFacade(BankingFacade);
    const banks = await firstValueFrom(
      banking.banks$.pipe(filter((loaded): loaded is Bank[] => loaded !== null)),
    );
    savingsBank = banks.find((candidate) => candidate.conditions.savingsAccount !== null);
    banking.openAccount(savingsBank?.id ?? '', 'savings');
    await run(100);
    for (let n = 1; n <= count; n++) {
      banking.transfer({
        fromAccountId: 'acc-1',
        toAccountId: 'acc-2',
        amount: 100 + n,
        purpose: purpose(n),
      });
    }
    await run(100);
  }

  function clock(): string {
    return textOf(byTestId(page, 'shell.header.clock'));
  }

  function texts(): string[] {
    return [...page.querySelectorAll('[data-testid="banking.statement.entry.text"]')].map(textOf);
  }

  function total(): string {
    return textOf(byTestId(page, 'banking.statement.total'));
  }

  it('shows the start capital, and the living costs after the bank run', async () => {
    await open('accounts/acc-1');
    expect(texts()).toEqual(['Startkapital']);
    expect(total()).toBe('1 Buchung');
    expect(textOf(byTestId(page, 'banking.statement.account.balance'))).toBe('10.000,00 €');

    // New bookings of the account show without leaving the page.
    await jumpPastBankRun();
    expect(texts()).toEqual(['Lebenshaltung April 2030', 'Startkapital']);
    expect(total()).toBe('2 Buchungen');
    const amounts = [...page.querySelectorAll('[data-testid="banking.statement.entry.amount"]')];
    expect(textOf(amounts[0])).toMatch(/^−[\d.]+,\d{2} €$/);
    expect(amounts[0].classList).toContain('text-down');
    expect(textOf(amounts[1])).toBe('+10.000,00 €');
    expect(amounts[1].classList).toContain('text-up');
  });

  it('loads further pages while scrolling', async () => {
    await open('accounts');
    await transferToSavings(60, (n) => `Sparrate ${n}`);
    await open('accounts/acc-1');
    // Opening balance and 60 transfers: more than the first page of 50 rows.
    expect(total()).toBe('61 Buchungen');
    expect(texts()[0]).toBe(`Überweisung an Tagesgeld 0000000002 · ${savingsBank?.name}`);
    const list = byTestId(page, 'banking.statement.list');
    scrollTo(list, 61 * ROW_HEIGHT_PX - VIEWPORT_HEIGHT_PX);
    await run(100);
    expect(texts().at(-1)).toBe('Startkapital');
    expect(queryByTestId(page, 'banking.statement.placeholder')).toBeNull();
    expect(list.getAttribute('tabindex')).toBe('0');
  });

  it('filters by type, searches the purpose and resets a filter without matches', async () => {
    await open('accounts');
    await transferToSavings(3, (n) => (n === 2 ? 'Urlaub Mai' : `Sparrate ${n}`));
    await open('accounts/acc-1');
    expect(total()).toBe('4 Buchungen');

    select(byTestId(page, 'banking.statement.filter.type'), 'opening-balance');
    await run(100);
    expect(texts()).toEqual(['Startkapital']);

    select(byTestId(page, 'banking.statement.filter.type'), '');
    typeText(byTestId<HTMLInputElement>(page, 'banking.statement.filter.search'), 'urlaub');
    await searchSettled();
    expect(total()).toBe('1 Buchung');
    expect(textOf(byTestId(page, 'banking.statement.entry.detail'))).toBe('Urlaub Mai');

    typeText(byTestId<HTMLInputElement>(page, 'banking.statement.filter.search'), 'Lotto');
    await searchSettled();
    expect(queryByTestId(page, 'banking.statement.no-matches')).not.toBeNull();
    click(byTestId(page, 'banking.statement.reset-filter'));
    await run(100);
    expect(total()).toBe('4 Buchungen');
    expect(byTestId<HTMLInputElement>(page, 'banking.statement.filter.search').value).toBe('');
  });

  it('tells that an unknown account does not exist and links back to the accounts', async () => {
    await open('accounts/acc-99');
    expect(queryByTestId(page, 'banking.statement.not-found')).not.toBeNull();
    click(byTestId(page, 'banking.statement.not-found.back'));
    await settle(harness.fixture);
    expect(TestBed.inject(Router).url).toBe(`/game/${playerId}/accounts`);
    // No toast: the page itself explains it.
    expect(document.body.querySelector('[data-testid^="toast."]')).toBeNull();
  });

  it('closes the shown account from its head and returns to the accounts', async () => {
    await open('accounts/acc-1');
    // The salary account offers neither the switch nor a transfer without a second account.
    expect(queryByTestId(page, 'banking.statement.account.salary-account')).toBeNull();
    expect(queryByTestId(page, 'banking.statement.account.transfer')).toBeNull();

    await open('accounts');
    await transferToSavings(0, () => '');
    await open('accounts/acc-2');
    expect(queryByTestId(page, 'banking.statement.account.transfer')).not.toBeNull();
    click(byTestId(page, 'banking.statement.account.close'));
    await settle(harness.fixture);
    // Nothing remains on an empty account, so there is no target to choose.
    expect(textOf(byTestId(document.body, 'banking.close-account-dialog.remainder'))).toBe(
      '0,00 €',
    );
    expect(queryByTestId(document.body, 'banking.close-account-dialog.target')).toBeNull();
    click(byTestId(document.body, 'banking.close-account-dialog.submit'));
    await run(100);
    expect(TestBed.inject(Router).url).toBe(`/game/${playerId}/accounts`);
    expect(textOf(byTestId(page, 'banking.accounts.closed.toggle'))).toBe(
      'Geschlossene Konten (1)',
    );
  });

  /** Waits for the debounced search, then for its query. */
  async function searchSettled(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, STATEMENT_SEARCH_DEBOUNCE_MS + 50));
    await run(100);
  }
});
