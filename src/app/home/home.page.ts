import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { IonContent, IonHeader, IonTitle, IonToolbar } from '@ionic/angular';

import { LogoComponent } from '../shell/ui/logo/logo.component';
import { TransactionsFacade } from '../transactions/feature/state/transactions.facade';
import { UsersFacade } from '../users/feature/state/users.facade';

@Component({
  selector: 'app-home',
  templateUrl: 'home.page.html',
  imports: [CommonModule, IonHeader, IonToolbar, IonTitle, IonContent, LogoComponent],
})
export class HomePage {
  usersFacade = inject(UsersFacade);
  transactionsFacade = inject(TransactionsFacade);
}
