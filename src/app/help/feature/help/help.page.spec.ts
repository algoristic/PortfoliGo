import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';

import { GLOSSARY_TERM_IDS } from '@app/help/domain/models/glossary.model';
import { providePlayersTestPorts } from '@app/players/data-access/testing/fake-players-ports';

import { byTestId, click, queryByTestId, textOf, typeText } from '../../../../testing/dom';
import { renderRoute, settle } from '../../../../testing/page';

// PS US-UI-06: a glossary with search and an anchor per term, reachable without a game.

describe('HelpPage', () => {
  let harness: RouterTestingHarness;
  let page: HTMLElement;

  beforeEach(() => {
    localStorage.clear();
  });

  async function openApp(url: string): Promise<void> {
    harness = await renderRoute(url, [providePlayersTestPorts()]);
    page = harness.fixture.nativeElement;
  }

  async function act(action: () => void): Promise<void> {
    action();
    await settle(harness.fixture);
  }

  function url(): string {
    return TestBed.inject(Router).url;
  }

  function entryIds(): string[] {
    return [...page.querySelectorAll('article')].map((entry) =>
      (entry.getAttribute('data-testid') ?? '').replace('help.glossary.', ''),
    );
  }

  function search(): HTMLInputElement {
    return byTestId<HTMLInputElement>(page, 'help.glossary.search');
  }

  it('lists every term and filters them by the search', async () => {
    await openApp('/help');
    expect(document.title).toBe('Glossar · PortfoliGo');
    expect([...entryIds()].sort()).toEqual([...GLOSSARY_TERM_IDS].sort());
    expect(textOf(byTestId(page, 'help.glossary.capital-gains-tax.short'))).toContain('25 %');
    expect(textOf(byTestId(page, 'help.glossary.saver-allowance.short'))).toContain('1.000 €');

    // found by a keyword, without accents and in lower case
    await act(() => typeText(search(), 'geldkurs'));
    expect(entryIds()).toContain('spread');
    expect(entryIds()).not.toContain('depot');

    // the order of the glossary stays; the tax mentions the allowance in its short text
    await act(() => typeText(search(), 'Sparerpauschbetrag'));
    expect(entryIds()).toEqual(['capital-gains-tax', 'saver-allowance']);

    await act(() => typeText(search(), 'xyzxyz'));
    expect(entryIds()).toEqual([]);
    expect(textOf(byTestId(page, 'help.glossary.result'))).toBe('Kein Begriff gefunden.');
  });

  it('jumps to the term of the URL fragment and follows „Siehe auch“', async () => {
    await openApp('/help#ter');
    const ter = byTestId(page, 'help.glossary.ter');
    expect(ter.getAttribute('aria-current')).toBe('location');
    expect(document.activeElement).toBe(ter.querySelector('h3'));

    await act(() => click(byTestId(page, 'help.glossary.ter.related.etf')));
    expect(url()).toBe('/help#etf');
    expect(byTestId(page, 'help.glossary.etf').getAttribute('aria-current')).toBe('location');
    expect(byTestId(page, 'help.glossary.ter').getAttribute('aria-current')).toBeNull();
    expect(document.activeElement).toBe(byTestId(page, 'help.glossary.etf').querySelector('h3'));
  });

  it('clears the search when a link targets a term', async () => {
    await openApp('/help');
    await act(() => typeText(search(), 'Dividende'));
    await act(() => click(byTestId(page, 'help.glossary.dividend.related.capital-gains-tax')));
    expect(search().value).toBe('');
    expect(queryByTestId(page, 'help.glossary.capital-gains-tax')).not.toBeNull();
  });

  it('is linked from the players page', async () => {
    await openApp('/players');
    await act(() => click(byTestId(page, 'about.disclaimer-hint.glossary')));
    expect(url()).toBe('/help');
    await act(() => click(byTestId(page, 'help.back')));
    expect(url()).toBe('/players');
  });
});
