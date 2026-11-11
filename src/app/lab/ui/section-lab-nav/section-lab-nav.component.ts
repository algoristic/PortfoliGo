import { Component, input } from '@angular/core';
import { RouterModule } from '@angular/router';

import { LabNavItem } from './section-lab-nav.model';

@Component({
  selector: 'app-section-lab-nav',
  imports: [RouterModule],
  templateUrl: './section-lab-nav.component.html',
  styleUrl: './section-lab-nav.component.scss',
})
export class SectionLabNavComponent {
  items = input.required<LabNavItem[]>();

  navLabel = $localize`:@@uiLab-sectionLabNav-navLabel:Labor-Navigation`;
}
