import { Tab, TabContent, TabList, TabPanel, Tabs } from '@angular/aria/tabs';
import { NgTemplateOutlet } from '@angular/common';
import { Component, contentChildren, input, linkedSignal, output } from '@angular/core';

import { TabPanelDirective } from './tab-panel.directive';
import { TabItem } from './tabs.model';

/** Tabs with arrow key, Home and End navigation (Angular Aria); panels are rendered lazily. */
@Component({
  selector: 'app-tabs',
  imports: [NgTemplateOutlet, Tabs, TabList, Tab, TabPanel, TabContent],
  templateUrl: './tabs.component.html',
  host: { class: 'block' },
})
export class TabsComponent {
  tabs = input.required<TabItem[]>();
  activeTab = input<string>();
  /** Accessible name of the tab list. */
  label = input.required<string>();
  testId = input('tabs');

  selectedTab = output<string>();

  panels = contentChildren(TabPanelDirective);

  currentTab = linkedSignal(() => this.activeTab() ?? this.tabs()[0]?.id);

  onSelectTab(tabId: string | undefined): void {
    if (tabId === undefined || tabId === this.currentTab()) {
      return;
    }
    this.currentTab.set(tabId);
    this.selectedTab.emit(tabId);
  }
}
