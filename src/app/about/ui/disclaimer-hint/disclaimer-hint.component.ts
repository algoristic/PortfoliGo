import { Component, input } from '@angular/core';
import { RouterModule } from '@angular/router';

/** Short note that PortfoliGo is a game and no investment advice (US-UI-08, E-26). */
@Component({
  selector: 'app-disclaimer-hint',
  imports: [RouterModule],
  templateUrl: './disclaimer-hint.component.html',
  host: { class: 'block' },
})
export class DisclaimerHintComponent {
  /** Router link of the page „Über PortfoliGo“. */
  aboutLink = input.required<string>();
  /** Router link of the glossary (PS US-UI-06). */
  glossaryLink = input.required<string>();
}
