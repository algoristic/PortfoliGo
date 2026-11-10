import { Component, input } from '@angular/core';
import { RouterModule } from '@angular/router';

import { NavItem } from '../models/nav-item.model';

@Component({
  selector: 'app-section-side-nav',
  imports: [RouterModule],
  templateUrl: './section-side-nav.component.html',
  styleUrl: './section-side-nav.component.scss',
})
export class SectionSideNavComponent {
  items = input.required<NavItem[]>();

  navLabel = $localize`:@@uiShell-sectionSideNav-navLabel:Hauptnavigation`;
}
