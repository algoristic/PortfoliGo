import { Component, input, OnInit } from '@angular/core';

@Component({
  selector: 'app-inline-logo',
  template: 'Portfoli<span class="go">Go</span>',
  styleUrls: ['./inline-logo.component.scss'],
})
export class InlineLogoComponent {}
