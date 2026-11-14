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

import { installChartPlatform } from '../../../../testing/chart-platform';
import { byTestId, click, press, queryByTestId, textOf } from '../../../../testing/dom';
import { renderRoute, settle } from '../../../../testing/page';

const ANNA: NewPlayer = {
  name: 'Anna',
  seed: 'kupfer-falke-731',
  start: { startCapital: 1_000_000, netIncome: 250_000, livingCosts: 180_000 },
};

// PS US-UI-06: context help next to a term links its entry in the glossary of the game.

describe('GameHelpPage', () => {
  let engine: InProcessEngine;
  let harness: RouterTestingHarness;
  let page: HTMLElement;
  let playerId: string;
  let restorePlatform: () => void;

  beforeEach(async () => {
    restorePlatform = installChartPlatform();
    localStorage.clear();
    const locks = new FakePlayerLocks();
    engine = new InProcessEngine({ storage: 'indexed-db', locks });
    harness = await renderRoute('/players', [
      provideInProcessEngineWorker(engine),
      providePlayersTestPorts({ locks }),
    ]);
    page = harness.fixture.nativeElement;
    ({
      profile: { id: playerId },
    } = await firstValueFrom(TestBed.inject(PlayersService).createPlayer(ANNA)));
    await harness.navigateByUrl(`/game/${playerId}/taxes`);
    await engine.advance(200);
    await settle(harness.fixture);
  });

  afterEach(() => restorePlatform());

  async function act(action: () => void): Promise<void> {
    action();
    await settle(harness.fixture);
  }

  function url(): string {
    return TestBed.inject(Router).url;
  }

  it('explains a term in a popover and opens its entry in the game', async () => {
    const hint = byTestId(page, 'help.hint.saver-allowance');
    expect(hint.getAttribute('aria-label')).toBe('Erklärung: Sparerpauschbetrag');
    expect(hint.getAttribute('aria-expanded')).toBe('false');

    await act(() => click(hint));
    expect(hint.getAttribute('aria-expanded')).toBe('true');
    const popover = byTestId(document.body, 'help.hint.saver-allowance.popover');
    expect(popover.getAttribute('role')).toBe('dialog');
    expect(textOf(byTestId(document.body, 'help.hint.saver-allowance.text'))).toContain('1.000 €');

    // Escape closes it and gives the focus back
    await act(() => press(popover, 'Escape'));
    expect(queryByTestId(document.body, 'help.hint.saver-allowance.popover')).toBeNull();

    await act(() => click(hint));
    await act(() => click(byTestId(document.body, 'help.hint.saver-allowance.link')));
    expect(url()).toBe(`/game/${playerId}/help#saver-allowance`);
    expect(document.title).toBe('Glossar · PortfoliGo');
    expect(byTestId(page, 'help.glossary.saver-allowance').getAttribute('aria-current')).toBe(
      'location',
    );
    expect(queryByTestId(document.body, 'help.hint.saver-allowance.popover')).toBeNull();
    // the game stays loaded
    expect(queryByTestId(page, 'shell.header.clock')).not.toBeNull();
  });
});
