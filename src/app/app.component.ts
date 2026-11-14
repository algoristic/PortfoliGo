import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

import { AppUpdateComponent } from '@app/pwa/feature/app-update/app-update.component';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, AppUpdateComponent],
  templateUrl: './app.component.html',
  host: { class: 'block' },
})
export class AppComponent {}
