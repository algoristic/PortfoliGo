import { Menu, MenuItem, MenuTrigger } from '@angular/aria/menu';
import { Component, computed, input, output } from '@angular/core';
import { RouterModule } from '@angular/router';

import { NavItem } from '../models/nav-item.model';

@Component({
  selector: 'app-section-bottom-nav',
  imports: [RouterModule, Menu, MenuItem, MenuTrigger],
  templateUrl: './section-bottom-nav.component.html',
  styleUrl: './section-bottom-nav.component.scss',
})
export class SectionBottomNavComponent {
  items = input.required<NavItem[]>();
  moreItems = input.required<NavItem[]>();
  activePath = input<string | null>();

  selectedMenuItem = output<string>();

  isMoreActive = computed(() => this.moreItems().some((item) => item.path === this.activePath()));

  navLabel = $localize`:@@uiShell-sectionBottomNav-navLabel:Hauptnavigation`;
  moreLabel = $localize`:@@uiShell-sectionBottomNav-more:Mehr`;

  onSelectMenuItem(path: string | undefined): void {
    if (path !== undefined) {
      this.selectedMenuItem.emit(path);
    }
  }
}
