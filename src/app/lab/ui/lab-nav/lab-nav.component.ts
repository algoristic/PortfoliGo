import { Component, input } from '@angular/core';
import { RouterModule } from '@angular/router';

import { IconDirective } from '@app/shared/ui/icon/icon.directive';
import { NavItem } from '@app/shared/ui/nav-link/nav-item.model';
import { NavLinkDirective } from '@app/shared/ui/nav-link/nav-link.directive';

@Component({
  selector: 'app-lab-nav',
  imports: [RouterModule, IconDirective, NavLinkDirective],
  templateUrl: './lab-nav.component.html',
  host: { class: 'block' },
})
export class LabNavComponent {
  items = input.required<NavItem[]>();

  navLabel = $localize`:@@uiLab-labNav-navLabel:Labor-Navigation`;
}
