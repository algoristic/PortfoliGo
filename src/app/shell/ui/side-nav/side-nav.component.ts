import { Component, input } from '@angular/core';
import { RouterModule } from '@angular/router';

import { IconDirective } from '@app/shared/ui/icon/icon.directive';
import { NavItem } from '@app/shared/ui/nav-link/nav-item.model';
import { NavLinkDirective } from '@app/shared/ui/nav-link/nav-link.directive';

@Component({
  selector: 'app-side-nav',
  imports: [RouterModule, IconDirective, NavLinkDirective],
  templateUrl: './side-nav.component.html',
  host: { class: 'block' },
})
export class SideNavComponent {
  items = input.required<NavItem[]>();

  navLabel = $localize`:@@uiShell-sideNav-navLabel:Hauptnavigation`;
}
