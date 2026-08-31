import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  FormControl,
  FormGroup,
  FormsModule,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import {
  IonContent,
  IonHeader,
  IonInput,
  IonItem,
  IonList,
  IonText,
  IonTitle,
  IonToolbar,
} from '@ionic/angular';
import * as uuid from 'uuid';

import { LogoComponent } from '../../../shell/ui/logo/logo.component';
import { InlineLogoComponent } from '../../../shell/ui/inline-logo/inline-logo.component';

@Component({
  selector: 'app-create-user',
  templateUrl: './create-user.page.html',
  styleUrls: ['./create-user.page.scss'],
  imports: [
    IonContent,
    IonHeader,
    IonInput,
    IonItem,
    IonList,
    IonText,
    IonTitle,
    IonToolbar,
    CommonModule,
    ReactiveFormsModule,
    LogoComponent,
    InlineLogoComponent,
  ],
})
export class CreateUserPage {
  createUserForm = new FormGroup({
    id: new FormControl<string>(uuid.v4(), { nonNullable: true }),
    name: new FormControl<string>('', {
      validators: [Validators.required],
      nonNullable: true,
    }),
    startingCapital: new FormControl<number>(10_000, {
      validators: [Validators.required],
      nonNullable: true,
    }),
    monthlySavingsAmount: new FormControl<number>(200, {
      validators: [Validators.required],
      nonNullable: true,
    }),
  });

  submit(): void {
    const rawValue = this.createUserForm.getRawValue();
  }
}
