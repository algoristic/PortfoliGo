import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TabPanelDirective } from './tab-panel.directive';
import { TabsComponent } from './tabs.component';
import { TabItem } from './tabs.model';

import { byTestId, click, press, textOf } from '../../../../testing/dom';

@Component({
  selector: 'app-tabs-host',
  imports: [TabsComponent, TabPanelDirective],
  template: `
    <app-tabs
      label="Beispiel"
      testId="host.tabs"
      [tabs]="tabs"
      [activeTab]="activeTab()"
      (selectedTab)="selected.push($event)">
      <ng-template appTabPanel="overview"><p>Inhalt Übersicht</p></ng-template>
      <ng-template appTabPanel="chart"><p>Inhalt Chart</p></ng-template>
      <ng-template appTabPanel="profile"><p>Inhalt Profil</p></ng-template>
    </app-tabs>
  `,
})
class TabsHostComponent {
  tabs: TabItem[] = [
    { id: 'overview', label: 'Übersicht' },
    { id: 'chart', label: 'Chart' },
    { id: 'profile', label: 'Profil' },
  ];
  activeTab = signal<string | undefined>(undefined);
  selected: string[] = [];
}

describe('TabsComponent', () => {
  let fixture: ComponentFixture<TabsHostComponent>;
  let host: TabsHostComponent;
  let root: HTMLElement;

  async function act(action: () => void): Promise<void> {
    action();
    await fixture.whenStable();
  }

  function tab(id: string): HTMLElement {
    return byTestId(root, `host.tabs.${id}.tab`);
  }

  function visiblePanels(): string[] {
    return Array.from(root.querySelectorAll('[role="tabpanel"]:not([inert])'), textOf);
  }

  beforeEach(async () => {
    fixture = TestBed.createComponent(TabsHostComponent);
    host = fixture.componentInstance;
    root = fixture.nativeElement;
    await fixture.whenStable();
  });

  it('shows the first tab and renders no other panel', () => {
    expect(tab('overview').getAttribute('aria-selected')).toBe('true');
    expect(visiblePanels()).toEqual(['Inhalt Übersicht']);
    expect(textOf(root)).not.toContain('Inhalt Chart');
  });

  describe('selectedTab', () => {
    it('reports a click on another tab once and shows its panel', async () => {
      await act(() => click(tab('chart')));
      expect(host.selected).toEqual(['chart']);
      expect(tab('chart').getAttribute('aria-selected')).toBe('true');
      expect(tab('overview').getAttribute('aria-selected')).toBe('false');
      expect(visiblePanels()).toEqual(['Inhalt Chart']);
    });

    it('stays quiet for a click on the active tab', async () => {
      await act(() => click(tab('overview')));
      expect(host.selected).toEqual([]);
    });

    it('follows the arrow keys, Home and End', async () => {
      await act(() => press(tab('overview'), 'ArrowRight'));
      expect(visiblePanels()).toEqual(['Inhalt Chart']);
      await act(() => press(tab('chart'), 'End'));
      expect(visiblePanels()).toEqual(['Inhalt Profil']);
      await act(() => press(tab('profile'), 'Home'));
      expect(visiblePanels()).toEqual(['Inhalt Übersicht']);
      expect(host.selected).toEqual(['chart', 'profile', 'overview']);
    });
  });

  describe('activeTab', () => {
    it('selects the tab without reporting it', async () => {
      await act(() => host.activeTab.set('profile'));
      expect(tab('profile').getAttribute('aria-selected')).toBe('true');
      expect(visiblePanels()).toEqual(['Inhalt Profil']);
      expect(host.selected).toEqual([]);
    });
  });
});
