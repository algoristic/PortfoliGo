import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { firstValueFrom } from 'rxjs';

import { EngineService } from '@app/engine/data-access/service/engine.service';
import {
  InProcessEngine,
  provideInProcessEngineWorker,
} from '@app/engine/data-access/testing/in-process-engine-worker';
import { FakePlayerLocks } from '@app/persistence/data-access/testing/fake-player-locks';
import { PlayersService } from '@app/players/data-access/service/players.service';
import { providePlayersTestPorts } from '@app/players/data-access/testing/fake-players-ports';
import { NewPlayer } from '@app/players/domain/models/player.model';

import { installChartPlatform } from '../../../../testing/chart-platform';
import { byTestId, click, press, queryByTestId, textOf, typeText } from '../../../../testing/dom';
import { renderRoute, settle } from '../../../../testing/page';
import { installViewport } from '../../../../testing/viewport';

const ANNA: NewPlayer = {
  name: 'Anna',
  seed: 'kupfer-falke-731',
  start: { startCapital: 1_000_000, netIncome: 250_000, livingCosts: 180_000 },
};

// PS US-UI-05: the command palette finds pages, actions and instruments with Ctrl/Cmd+K.

describe('command palette', () => {
  let engine: InProcessEngine;
  let harness: RouterTestingHarness;
  let page: HTMLElement;
  let restorePlatform: () => void;
  let restoreViewport: () => void;

  beforeEach(async () => {
    restorePlatform = installChartPlatform();
    restoreViewport = installViewport(1024);
    localStorage.clear();
    const locks = new FakePlayerLocks();
    engine = new InProcessEngine({ storage: 'indexed-db', locks });
    harness = await renderRoute('/players', [
      provideInProcessEngineWorker(engine),
      providePlayersTestPorts({ locks }),
    ]);
    page = harness.fixture.nativeElement;
    const { profile } = await firstValueFrom(TestBed.inject(PlayersService).createPlayer(ANNA));
    await harness.navigateByUrl(`/game/${profile.id}`);
    await run(200);
  });

  afterEach(() => {
    restoreViewport();
    restorePlatform();
  });

  async function run(ms: number): Promise<void> {
    await engine.advance(ms);
    await settle(harness.fixture);
  }

  async function act(action: () => void): Promise<void> {
    action();
    await settle(harness.fixture);
  }

  async function pressShortcut(target: Element = document.body): Promise<void> {
    await act(() =>
      target.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true, cancelable: true }),
      ),
    );
  }

  function url(): string {
    return TestBed.inject(Router).url;
  }

  function input(): HTMLInputElement {
    return byTestId<HTMLInputElement>(document.body, 'shell.command-palette.input');
  }

  function isOpen(): boolean {
    return queryByTestId(document.body, 'shell.command-palette.input') !== null;
  }

  function optionTestIds(): string[] {
    return [...document.body.querySelectorAll('[role="option"]')].map(
      (option) => option.getAttribute('data-testid') ?? '',
    );
  }

  function activeOption(): HTMLElement | null {
    const id = input().getAttribute('aria-activedescendant');
    return id === null ? null : document.getElementById(id);
  }

  async function search(query: string): Promise<void> {
    await act(() => typeText(input(), query));
  }

  it('opens with Ctrl+K, finds a page and navigates there with Enter', async () => {
    await pressShortcut();
    expect(isOpen()).toBe(true);
    expect(document.activeElement).toBe(input());
    expect(input().getAttribute('role')).toBe('combobox');
    expect(input().getAttribute('aria-controls')).toBe(
      byTestId(document.body, 'shell.command-palette.list').id,
    );
    // Without a query: the actions first, the new player is paused, so „Weiter“
    expect(textOf(activeOption()!)).toContain('Weiter');
    expect(activeOption()!.getAttribute('aria-selected')).toBe('true');

    await search('steuer');
    expect(optionTestIds()[0]).toBe('shell.command-palette.option.page-taxes');
    expect(activeOption()!.getAttribute('data-testid')).toBe(
      'shell.command-palette.option.page-taxes',
    );
    await act(() => press(input(), 'Enter'));
    expect(isOpen()).toBe(false);
    expect(url()).toMatch(/^\/game\/p-[0-9a-f]+\/taxes$/);
  });

  it('runs an action from the header button and returns the focus to it', async () => {
    const trigger = byTestId(page, 'shell.header.command-palette');
    trigger.focus();
    await act(() => click(trigger));
    expect(isOpen()).toBe(true);

    await search('weiter');
    expect(activeOption()!.getAttribute('data-testid')).toBe(
      'shell.command-palette.option.toggle-pause',
    );
    await act(() => press(input(), 'Enter'));
    await run(200);
    expect(isOpen()).toBe(false);
    expect(queryByTestId(page, 'shell.header.paused')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it('closes with Escape without running anything', async () => {
    const trigger = byTestId(page, 'shell.header.command-palette');
    trigger.focus();
    await act(() => click(trigger));
    await search('steuer');
    await act(() => press(input(), 'Escape'));
    expect(isOpen()).toBe(false);
    expect(url()).toMatch(/\/dashboard$/);
    expect(document.activeElement).toBe(trigger);
  });

  it('finds an instrument by its ticker, moves with the arrow keys and opens its page', async () => {
    const { instruments } = await firstValueFrom(TestBed.inject(EngineService).instruments());
    const stock = instruments.find((instrument) => instrument.kind === 'stock')!;

    await pressShortcut();
    await search(stock.ticker);
    expect(optionTestIds().slice(0, 2)).toEqual([
      `shell.command-palette.option.instrument-${stock.id}`,
      `shell.command-palette.option.buy-${stock.id}`,
    ]);
    expect(textOf(activeOption()!)).toContain(stock.name);

    await act(() => press(input(), 'ArrowDown'));
    expect(activeOption()!.getAttribute('data-testid')).toBe(
      `shell.command-palette.option.buy-${stock.id}`,
    );
    // ArrowUp twice wraps from the first option to the last one
    await act(() => press(input(), 'ArrowUp'));
    await act(() => press(input(), 'ArrowUp'));
    expect(activeOption()!.getAttribute('data-testid')).toBe(optionTestIds().at(-1));
    await act(() => press(input(), 'ArrowDown'));

    await act(() => press(input(), 'Enter'));
    expect(url()).toMatch(new RegExp(`/markets/${stock.id}$`));
  });

  it('says when nothing matches', async () => {
    await pressShortcut();
    await search('xyzxyz');
    expect(optionTestIds()).toEqual([]);
    expect(input().getAttribute('aria-activedescendant')).toBeNull();
    expect(textOf(byTestId(document.body, 'shell.command-palette.status'))).toContain(
      'Keine Treffer.',
    );
    await act(() => press(input(), 'Enter'));
    expect(isOpen()).toBe(true);
  });

  it('ignores Ctrl+K when the shortcuts are switched off', async () => {
    await harness.navigateByUrl(url().replace(/dashboard$/, 'settings'));
    await settle(harness.fixture);
    await act(() => click(byTestId(page, 'settings.device.shortcuts')));
    await pressShortcut();
    expect(isOpen()).toBe(false);
    expect(textOf(byTestId(page, 'shell.header.command-palette'))).not.toContain('Strg K');
    expect(byTestId(page, 'shell.header.command-palette').getAttribute('aria-keyshortcuts')).toBe(
      null,
    );

    // the button still opens it
    await act(() => click(byTestId(page, 'shell.header.command-palette')));
    expect(isOpen()).toBe(true);
  });
});
