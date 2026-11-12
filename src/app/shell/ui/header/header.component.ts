import { Menu, MenuItem, MenuTrigger } from '@angular/aria/menu';
import { Component, computed, input, output } from '@angular/core';
import { RouterModule } from '@angular/router';

import { IconDirective } from '@app/shared/ui/icon/icon.directive';
import { IconButtonDirective } from '@app/shared/ui/icon-button/icon-button.directive';
import { MenuItemDirective } from '@app/shared/ui/menu/menu-item.directive';
import { MenuDirective } from '@app/shared/ui/menu/menu.directive';

import { PlayerMenuAction } from './header.model';

/** Header of the game area; clock, net worth and search are placeholders until AP 2.5 / 4.4. */
@Component({
  selector: 'app-header',
  imports: [
    RouterModule,
    Menu,
    MenuItem,
    MenuTrigger,
    IconButtonDirective,
    IconDirective,
    MenuDirective,
    MenuItemDirective,
  ],
  templateUrl: './header.component.html',
  host: { class: 'block' },
})
export class HeaderComponent {
  compact = input(false);
  activePath = input<string | null>();

  selectedPlayerMenuAction = output<PlayerMenuAction>();

  isSettingsActive = computed(() => this.activePath() === 'settings');

  clockLabel = $localize`:@@uiShell-header-clockLabel:Spielzeit`;
  netWorthLabel = $localize`:@@uiShell-header-netWorthLabel:Gesamtvermögen`;
  searchLabel = $localize`:@@uiShell-header-searchLabel:Suchen`;
  notificationsLabel = $localize`:@@uiShell-header-notificationsLabel:Benachrichtigungen`;
  playerMenuLabel = $localize`:@@uiShell-header-playerMenuLabel:Spielermenü`;

  onSelectPlayerMenuAction(action: PlayerMenuAction | undefined): void {
    if (action !== undefined) {
      this.selectedPlayerMenuAction.emit(action);
    }
  }
}
