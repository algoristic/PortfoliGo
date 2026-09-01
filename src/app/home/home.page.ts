import { Component, inject } from '@angular/core';
import { IonContent, IonHeader, IonText, IonTitle, IonToolbar } from '@ionic/angular';

import { LogoComponent } from '../shell/ui/logo/logo.component';
import { UsersFacade } from '../users/feature/state/users.facade';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-home',
  templateUrl: 'home.page.html',
  imports: [CommonModule, IonHeader, IonToolbar, IonTitle, IonContent, IonText, LogoComponent],
})
export class HomePage {
  usersFacade = inject(UsersFacade);
}
