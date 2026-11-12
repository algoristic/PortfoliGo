import { Menu, MenuItem, MenuTrigger } from '@angular/aria/menu';
import { Component, computed, input, output } from '@angular/core';
import { RouterModule } from '@angular/router';

import { IconDirective } from '@app/shared/ui/icon/icon.directive';
import { MenuItemDirective } from '@app/shared/ui/menu/menu-item.directive';
import { MenuDirective } from '@app/shared/ui/menu/menu.directive';
import { NavItem } from '@app/shared/ui/nav-link/nav-item.model';

@Component({
  selector: 'app-bottom-nav',
  imports: [
    RouterModule,
    Menu,
    MenuItem,
    MenuTrigger,
    IconDirective,
    MenuDirective,
    MenuItemDirective,
  ],
  templateUrl: './bottom-nav.component.html',
  styleUrl: './bottom-nav.component.scss',
  host: { class: 'block bg-surface' },
})
export class BottomNavComponent {
  items = input.required<NavItem[]>();
  moreItems = input.required<NavItem[]>();
  activePath = input<string | null>();

  selectedMenuItem = output<string>();

  isMoreActive = computed(() => this.moreItems().some((item) => item.path === this.activePath()));

  navLabel = $localize`:@@uiShell-bottomNav-navLabel:Hauptnavigation`;
  moreLabel = $localize`:@@uiShell-bottomNav-more:Mehr`;

  onSelectMenuItem(path: string | undefined): void {
    if (path !== undefined) {
      this.selectedMenuItem.emit(path);
    }
  }
}
