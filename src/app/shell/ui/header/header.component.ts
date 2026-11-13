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

/** Larger numbers show as „99+“ on the bell. */
const MAX_BADGE_COUNT = 99;

/**
 * Header of the game area with the net worth from `md` on and the bell with the number of unread
 * notifications (TS §11.4); the search is a placeholder until AP 4.4. The shell projects
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
  /** Unread notifications (TS §12); `null` until the first projection of the loaded player. */
  unreadCount = input<number | null>();

  selectedPlayerMenuAction = output<PlayerMenuAction>();

  isSettingsActive = computed(() => this.activePath() === 'settings');
  unreadBadge = computed(() => {
    const count = this.unreadCount() ?? 0;
    if (count <= 0) {
      return null;
    }
    return count > MAX_BADGE_COUNT ? `${MAX_BADGE_COUNT}+` : String(count);
  });
  bellLabel = computed(() => {
    const count = this.unreadCount() ?? 0;
    return count > 0
      ? $localize`:@@uiShell-header-notificationsUnreadLabel:Benachrichtigungen, ${count}:count: ungelesen`
      : this.notificationsLabel;
  });

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
