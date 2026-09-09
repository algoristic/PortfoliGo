import { CommonModule } from '@angular/common';
import { Component, effect, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import {
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonInput,
  IonModal,
  IonNote,
  IonText,
  IonTitle,
  IonToolbar,
} from '@ionic/angular';
import { MaskitoDirective, MaskitoPipe } from '@maskito/angular';
import { MaskitoElementPredicate, maskitoTransform } from '@maskito/core';
import { maskitoParseNumber } from '@maskito/kit';

import { CREATE_USER_CONFIG } from './create-user.config';

import { CURRENCY, CURRENCY_CONFIG } from '../../../currency/util/currency.config';
import { CurrencyValidators } from '../../../currency/util/currency.validators';
import { InlineLogoComponent } from '../../../shell/ui/inline-logo/inline-logo.component';
import { UsersFacade } from '../state/users.facade';
import { CreateUserProperties } from '../state/users.model';

@Component({
  selector: 'app-create-user',
  templateUrl: './create-user.page.html',
  styleUrls: ['./create-user.page.scss'],
  imports: [
    CommonModule,
    ReactiveFormsModule,
    IonButton,
    IonButtons,
    IonContent,
    IonHeader,
    IonIcon,
    IonInput,
    IonModal,
    IonNote,
    IonText,
    IonTitle,
    IonToolbar,
    MaskitoDirective,
    MaskitoPipe,
    InlineLogoComponent,
  ],
})
export class CreateUserPage {
  config = inject(CREATE_USER_CONFIG);
  usersFacade = inject(UsersFacade);
  router = inject(Router);
  currencyConfig = inject(CURRENCY_CONFIG);
  currency = inject(CURRENCY);

  creatingUser = toSignal(this.usersFacade.creatingUser$);

  readonly maskPredicate: MaskitoElementPredicate = async (el) => {
    return (el as HTMLIonInputElement).getInputElement();
  };

  createUserForm = new FormGroup({
    name: new FormControl<string>('', {
      validators: [Validators.required],
      nonNullable: true,
    }),
    startingCapital: new FormControl<string>(
      maskitoTransform(this.config.startingCapital.initial.toLocaleString(), this.currency),
      {
        validators: [
          Validators.required,
          CurrencyValidators.currencyRange(
            this.config.startingCapital.min,
            this.config.startingCapital.max,
            this.currencyConfig,
          ),
        ],
        nonNullable: true,
      },
    ),
    monthlySavingsAmount: new FormControl<string>(
      maskitoTransform(this.config.monthlySavingsAmount.initial.toLocaleString(), this.currency),
      {
        validators: [
          Validators.required,
          CurrencyValidators.currencyRange(
            this.config.monthlySavingsAmount.min,
            this.config.monthlySavingsAmount.max,
            this.currencyConfig,
          ),
        ],
        nonNullable: true,
      },
    ),
  });

  constructor() {
    effect(() => {
      if (this.creatingUser()) {
        this.createUserForm.disable();
      } else {
        this.createUserForm.enable();
      }
    });
  }

  get name(): FormControl<string> {
    return this.createUserForm.controls.name;
  }

  get startingCapital(): FormControl<string> {
    return this.createUserForm.controls.startingCapital;
  }

  get monthlySavingsAmount(): FormControl<string> {
    return this.createUserForm.controls.monthlySavingsAmount;
  }

  get startingCapitalError(): string {
    return this.#currencyError(
      this.startingCapital,
      this.config.startingCapital.min,
      this.config.startingCapital.max,
    );
  }

  get monthlySavingsAmountError(): string {
    return this.#currencyError(
      this.monthlySavingsAmount,
      this.config.monthlySavingsAmount.min,
      this.config.monthlySavingsAmount.max,
    );
  }

  submit(): void {
    this.createUserForm.markAllAsTouched();

    if (this.createUserForm.invalid) {
      return;
    }

    const rawProperties = this.createUserForm.getRawValue();
    const properties: CreateUserProperties = {
      name: rawProperties.name,
      startingCapital: maskitoParseNumber(rawProperties.startingCapital, this.currencyConfig),
      monthlySavingsAmount: maskitoParseNumber(
        rawProperties.monthlySavingsAmount,
        this.currencyConfig,
      ),
    };

    this.usersFacade.submitUser(properties);
  }

  #currencyError(control: FormControl<string>, minimum: number, maximum: number): string {
    if (control.hasError('required')) {
      return $localize`:@@featureUsers-createUserPage-error-numberRequired:Bitte gib einen Betrag ein.`;
    }

    if (control.hasError('number')) {
      return $localize`:@@featureUsers-createUserPage-error-numberInvalid:Bitte gib einen gültigen Geldbetrag ein.`;
    }

    if (control.hasError('min')) {
      return $localize`:@@featureUsers-createUserPage-error-numberMin:Der Betrag darf nicht unter ${maskitoTransform(minimum.toString(), this.currency)} € liegen.`;
    }

    if (control.hasError('max')) {
      return $localize`:@@featureUsers-createUserPage-error-numberMax:Der Betrag darf ${maskitoTransform(maximum.toString(), this.currency)} nicht übersteigen.`;
    }

    return '';
  }
}
