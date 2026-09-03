import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import {
  IonContent,
  IonFab,
  IonFabButton,
  IonFabList,
  IonHeader,
  IonIcon,
  IonTitle,
  IonToolbar,
} from '@ionic/angular';
import { MaskitoPipe } from '@maskito/angular';

import { CURRENCY } from '../../../currency/util/currency.config';
import { LogoComponent } from '../../../shell/ui/logo/logo.component';
import { TransactionsFacade } from '../../../transactions/feature/state/transactions.facade';
import { UsersFacade } from '../../../users/feature/state/users.facade';
import { Router } from '@angular/router';
import { LandingFacade } from '../state/landing.facade';

@Component({
  selector: 'app-landing',
  templateUrl: './landing.page.html',
  styleUrls: ['./landing.page.scss'],
  imports: [
    CommonModule,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonContent,
    IonFab,
    IonFabButton,
    IonFabList,
    IonIcon,
    MaskitoPipe,
    LogoComponent,
  ],
})
export class LandingPage {
  currency = inject(CURRENCY);
  usersFacade = inject(UsersFacade);
  transactionsFacade = inject(TransactionsFacade);
  landingFacade = inject(LandingFacade);
}
