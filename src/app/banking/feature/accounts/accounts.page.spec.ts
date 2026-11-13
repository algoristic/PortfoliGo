import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { firstValueFrom } from 'rxjs';

import {
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
    await engine.advance(200);
    await settle(harness.fixture);
  });

  it('shows the salary account with the start capital and the totals', () => {
    // A new player has one current account at the home bank with the start capital (TS §7.2).
    const card = byTestId(page, 'banking.accounts.card.acc-1');
    expect(textOf(byTestId(card, 'banking.accounts.card.kind'))).toBe('Girokonto');
    expect(textOf(byTestId(card, 'banking.accounts.card.balance'))).toBe('10.000,00 €');
    expect(queryByTestId(card, 'banking.accounts.card.salary')).not.toBeNull();
    expect(textOf(byTestId(card, 'banking.accounts.card.bank'))).not.toBe('–');
    expect(textOf(byTestId(page, 'banking.accounts.totals.total'))).toContain('10.000,00 €');
    expect(textOf(byTestId(page, 'banking.accounts.totals.current'))).toContain('10.000,00 €');
    expect(textOf(byTestId(page, 'banking.accounts.totals.savings'))).toContain('0,00 €');
    expect(queryByTestId(page, 'banking.accounts.closed')).toBeNull();
  });

  it('opens the statement of an account', async () => {
    click(byTestId(page, 'banking.accounts.card.statement'));
    await settle(harness.fixture);
    expect(TestBed.inject(Router).url).toMatch(/\/accounts\/acc-1$/);
    expect(document.title).toBe('Kontoauszug · PortfoliGo');
  });
});
