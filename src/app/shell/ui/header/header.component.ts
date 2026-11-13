import { Menu, MenuItem, MenuTrigger } from '@angular/aria/menu';
import { Component, computed, input, output } from '@angular/core';
import { RouterModule } from '@angular/router';

import { Cents } from '@app/shared/domain/models/money.model';
import { IconDirective } from '@app/shared/ui/icon/icon.directive';
import { IconButtonDirective } from '@app/shared/ui/icon-button/icon-button.directive';
import { MenuItemDirective } from '@app/shared/ui/menu/menu-item.directive';
import { MenuDirective } from '@app/shared/ui/menu/menu.directive';
import { FormatCentsPipe } from '@app/shared/ui/pipes/format-cents/format-cents.pipe';

import { PlayerMenuAction } from './header.model';

/**
 * Header of the game area with the net worth from `md` on (TS §11.4); the search is a placeholder
 * until AP 4.4. The shell projects
 * the clock bar (`headerBar`, second row) and on phones the market status (`headerStatus`, next
 * to the brand).
 */
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
    FormatCentsPipe,
  ],
  templateUrl: './header.component.html',
  host: { class: 'block' },
})
export class HeaderComponent {
  compact = input(false);
  activePath = input<string | null>();
  /** `null` until the first projection of the loaded player. */
  netWorth = input<Cents | null>();

  selectedPlayerMenuAction = output<PlayerMenuAction>();

  isSettingsActive = computed(() => this.activePath() === 'settings');

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
