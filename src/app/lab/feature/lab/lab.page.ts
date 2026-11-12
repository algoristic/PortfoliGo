import { Component } from '@angular/core';
import { RouterModule } from '@angular/router';

import { IconDirective } from '@app/shared/ui/icon/icon.directive';
import { NavItem } from '@app/shared/ui/nav-link/nav-item.model';
import { NavLinkDirective } from '@app/shared/ui/nav-link/nav-link.directive';

import { LabNavComponent } from '../../ui/lab-nav/lab-nav.component';

/** Frame of the lab (`#/lab`) with the navigation between its pages. */
@Component({
  selector: 'app-lab-page',
  imports: [RouterModule, IconDirective, LabNavComponent, NavLinkDirective],
  templateUrl: './lab.page.html',
  host: { class: 'block' },
})
export class LabPage {
  navItems: NavItem[] = [
    {
      path: 'simulation',
      icon: 'graph-up',
      label: $localize`:@@featureLab-labPage-navSimulation:Simulation`,
    },
    {
      path: 'components',
      icon: 'grid',
      label: $localize`:@@featureLab-labPage-navComponents:UI-Bausteine`,
    },
    {
      path: 'tokens',
      icon: 'palette',
      label: $localize`:@@featureLab-labPage-navTokens:Design-Tokens`,
    },
  ];
}
