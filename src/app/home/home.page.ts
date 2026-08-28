import { Component } from '@angular/core';
import { IonHeader, IonToolbar, IonTitle, IonContent, IonText } from '@ionic/angular';
import { LogoComponent } from '../components/logo/logo.component';

@Component({
  selector: 'app-home',
  templateUrl: 'home.page.html',
  imports: [IonHeader, IonToolbar, IonTitle, IonContent, LogoComponent],
})
export class HomePage {
  constructor() {}
}
