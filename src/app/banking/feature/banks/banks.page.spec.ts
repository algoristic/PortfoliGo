import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { firstValueFrom } from 'rxjs';

import {
  generateMiniWorld,
  InProcessEngine,
  provideInProcessEngineWorker,
} from '@app/engine/data-access/testing/in-process-engine-worker';
import { FakePlayerLocks } from '@app/persistence/data-access/testing/fake-player-locks';
import { PlayersService } from '@app/players/data-access/service/players.service';
import { providePlayersTestPorts } from '@app/players/data-access/testing/fake-players-ports';
import { NewPlayer } from '@app/players/domain/models/player.model';

import { byTestId, click, queryByTestId, textOf } from '../../../../testing/dom';
import { renderRoute, settle } from '../../../../testing/page';

const ANNA: NewPlayer = {
  name: 'Anna',
  seed: 'kupfer-falke-731',
  start: { startCapital: 1_000_000, netIncome: 250_000, livingCosts: 180_000 },
};

// The banks of the mini world of Anna's seed (public API of the in-process engine), in world
// order: two branch banks, two direct banks, an online and a neo broker.
const BANKS = generateMiniWorld(ANNA.seed).world.banks;

describe('BanksPage', () => {
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
    await harness.navigateByUrl(`/game/${profile.id}/banks`);
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

  function rows(): HTMLElement[] {
    return [...page.querySelectorAll<HTMLElement>('[data-testid="banking.banks.row"]')];
  }

  function order(): string[] {
    return rows().map((row) => row.getAttribute('data-bank-id') ?? '');
  }

  function row(bankId: string): HTMLElement {
    const found = rows().find((candidate) => candidate.getAttribute('data-bank-id') === bankId);
    if (found === undefined) {
      throw new Error(`No row for ${bankId}`);
    }
    return found;
  }

  function sortHeader(key: string): HTMLElement {
    return byTestId(page, `banking.banks.sort.${key}`).closest('th') as HTMLElement;
  }

  it('lists all banks with their type and conditions in words', () => {
    expect(document.title).toBe('Bankenvergleich · PortfoliGo');
    expect(order()).toEqual(BANKS.map((bank) => bank.id));
    expect(rows().map((element) => textOf(byTestId(element, 'banking.banks.row.type')))).toEqual([
      'Filialbank',
      'Filialbank',
      'Direktbank',
      'Direktbank',
      'Onlinebroker',
      'Neobroker',
    ]);
    // The first direct bank of this seed: 5,40 € a month, waived from 700 € deposits.
    expect(BANKS[2].conditions.currentAccount?.monthlyFee).toBe(540);
    expect(textOf(byTestId(row('bnk-0003'), 'banking.banks.row.account-fee'))).toBe(
      '0,00 € ab 700,00 € Geldeingang, sonst 5,40 € im Monat',
    );
    // A broker has no current account; the neo broker trades with a market maker in fractions.
    expect(textOf(byTestId(row('bnk-0006'), 'banking.banks.row.account-fee'))).toBe('–');
    expect(textOf(byTestId(row('bnk-0006'), 'banking.banks.row.fractional'))).toBe('ja');
    expect(textOf(byTestId(row('bnk-0006'), 'banking.banks.row.venue'))).toMatch(
      /^Market Maker, Spread-Aufschlag /,
    );
    expect(sortHeader('accountFee').getAttribute('aria-sort')).toBe('none');
  });

  // TS §7.3 „Bankenvergleich“, worked out for the conditions of this seed's banks.
  it('sorts by the account fee and reverses on a second click', async () => {
    await act(() => click(byTestId(page, 'banking.banks.sort.accountFee')));
    // Waived fees first (5,30 € before 5,40 €), then 8,10 € and 11,10 €; brokers last by name.
    expect(order()).toEqual([
      'bnk-0004',
      'bnk-0003',
      'bnk-0002',
      'bnk-0001',
      'bnk-0005',
      'bnk-0006',
    ]);
    expect(sortHeader('accountFee').getAttribute('aria-sort')).toBe('ascending');

    await act(() => click(byTestId(page, 'banking.banks.sort.accountFee')));
    expect(order()).toEqual([
      'bnk-0001',
      'bnk-0002',
      'bnk-0003',
      'bnk-0004',
      'bnk-0005',
      'bnk-0006',
    ]);
    expect(sortHeader('accountFee').getAttribute('aria-sort')).toBe('descending');
  });

  it('sorts by the cost of an example order with the exchange fee', async () => {
    await act(() => click(byTestId(page, 'banking.banks.sort.orderCost1000')));
    // 0,90 €, 4,00 € + 2,50 €, 4,60 € + 2,10 €, 5,30 € + 2,50 €, 10,00 € + 1,60 €, 10,00 € + 3,00 €
    expect(order()).toEqual([
      'bnk-0006',
      'bnk-0004',
      'bnk-0005',
      'bnk-0003',
      'bnk-0002',
      'bnk-0001',
    ]);
    expect(textOf(byTestId(row('bnk-0001'), 'banking.banks.row.order-1000'))).toBe('13,00 €');
    expect(sortHeader('orderCost1000').getAttribute('aria-sort')).toBe('ascending');
    expect(sortHeader('accountFee').getAttribute('aria-sort')).toBe('none');
  });

  it('opens a depot at a bank of the comparison and shows it with the accounts', async () => {
    const helova = row('bnk-0006');
    await act(() => click(byTestId(helova, 'banking.banks.row.open-account')));
    expect(
      byTestId<HTMLSelectElement>(document.body, 'banking.open-account-dialog.bank').value,
    ).toBe('bnk-0006');
    // A neo broker only offers depots, so the depot is chosen.
    expect(
      byTestId<HTMLInputElement>(document.body, 'banking.open-account-dialog.kind.depot').checked,
    ).toBe(true);
    await act(() => click(byTestId(document.body, 'banking.open-account-dialog.submit')));
    await run(100);

    expect(TestBed.inject(Router).url).toMatch(/\/accounts$/);
    const cards = [...page.querySelectorAll('[data-testid^="banking.accounts.card.acc-"]')];
    expect(cards.map((element) => textOf(byTestId(element, 'banking.accounts.card.bank')))).toEqual(
      [BANKS[0].name, BANKS[5].name],
    );
    expect(queryByTestId(document.body, 'banking.open-account-dialog.submit')).toBeNull();
  });
});
