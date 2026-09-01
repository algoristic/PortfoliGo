import { CommonModule } from '@angular/common';
import { Component, inject, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  IonAvatar,
  IonButton,
  IonContent,
  IonHeader,
  IonIcon,
  IonItem,
  IonLabel,
  IonList,
  IonTitle,
  IonToolbar,
} from '@ionic/angular';
import { UsersFacade } from '../state/users.facade';
import { Router } from '@angular/router';

@Component({
  selector: 'app-select-user',
  templateUrl: './select-user.page.html',
  styleUrls: ['./select-user.page.scss'],
  imports: [
    CommonModule,
    IonAvatar,
    IonButton,
    IonContent,
    IonHeader,
    IonIcon,
    IonItem,
    IonLabel,
    IonList,
    IonTitle,
    IonToolbar,
  ],
})
export class SelectUserPage {
  usersFacade = inject(UsersFacade);
  router = inject(Router);
}
