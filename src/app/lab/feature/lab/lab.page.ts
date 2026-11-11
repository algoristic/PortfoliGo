import { Component } from '@angular/core';
import { RouterModule } from '@angular/router';

import { SectionLabNavComponent } from '../../ui/section-lab-nav/section-lab-nav.component';
import { LabNavItem } from '../../ui/section-lab-nav/section-lab-nav.model';

/** Frame of the lab (`#/lab`) with the navigation between its pages. */
@Component({
  selector: 'app-lab',
  imports: [RouterModule, SectionLabNavComponent],
  templateUrl: './lab.page.html',
  styleUrl: './lab.page.scss',
})
export class LabPage {
  navItems: LabNavItem[] = [
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
