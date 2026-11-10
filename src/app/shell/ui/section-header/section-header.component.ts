import { Menu, MenuItem, MenuTrigger } from '@angular/aria/menu';
import { Component, input, output } from '@angular/core';
import { RouterModule } from '@angular/router';

import { PlayerMenuAction } from './section-header.model';

import { IconButtonDirective } from '../../../shared/ui/icon-button/icon-button.directive';

/** Header of the game area; clock, net worth and search are placeholders until AP 2.5 / 4.4. */
@Component({
  selector: 'app-section-header',
  imports: [RouterModule, Menu, MenuItem, MenuTrigger, IconButtonDirective],
  templateUrl: './section-header.component.html',
  styleUrl: './section-header.component.scss',
})
export class SectionHeaderComponent {
  compact = input(false);

  selectedPlayerMenuAction = output<PlayerMenuAction>();

  clockLabel = $localize`:@@uiShell-sectionHeader-clockLabel:Spielzeit`;
  netWorthLabel = $localize`:@@uiShell-sectionHeader-netWorthLabel:Gesamtvermögen`;
  searchLabel = $localize`:@@uiShell-sectionHeader-searchLabel:Suchen`;
  notificationsLabel = $localize`:@@uiShell-sectionHeader-notificationsLabel:Benachrichtigungen`;
  playerMenuLabel = $localize`:@@uiShell-sectionHeader-playerMenuLabel:Spielermenü`;

  onSelectPlayerMenuAction(action: PlayerMenuAction | undefined): void {
    if (action !== undefined) {
      this.selectedPlayerMenuAction.emit(action);
    }
  }
}
