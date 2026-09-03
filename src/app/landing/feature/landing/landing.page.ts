import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { IonContent, IonHeader, IonTitle, IonToolbar } from '@ionic/angular';
import { MaskitoPipe } from '@maskito/angular';

import { CURRENCY } from '../../../currency/util/currency.config';
import { LogoComponent } from '../../../shell/ui/logo/logo.component';
import { TransactionsFacade } from '../../../transactions/feature/state/transactions.facade';
import { UsersFacade } from '../../../users/feature/state/users.facade';

@Component({
  selector: 'app-landing',
  templateUrl: './landing.page.html',
  styleUrls: ['./landing.page.scss'],
  imports: [CommonModule, IonHeader, IonToolbar, IonTitle, IonContent, MaskitoPipe, LogoComponent],
})
export class LandingPage {
  currency = inject(CURRENCY);
  usersFacade = inject(UsersFacade);
  transactionsFacade = inject(TransactionsFacade);
}
