import { Component } from '@angular/core';
import { IonContent, IonHeader, IonText, IonTitle, IonToolbar } from '@ionic/angular';

import { LogoComponent } from '../components/logo/logo.component';

@Component({
  selector: 'app-home',
  templateUrl: 'home.page.html',
  imports: [IonHeader, IonToolbar, IonTitle, IonContent, IonText, LogoComponent],
})
export class HomePage {
  constructor() {}
}
