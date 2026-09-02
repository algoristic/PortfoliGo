import { CommonModule } from '@angular/common';
import { Component, effect, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import {
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  ValidationErrors,
  ValidatorFn,
  Validators,
} from '@angular/forms';
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
import { MaskitoElementPredicate, MaskitoOptions, maskitoTransform } from '@maskito/core';
import { maskitoNumber, MaskitoNumberParams, maskitoParseNumber } from '@maskito/kit';

import { CREATE_USER_CONFIG } from './create-user.config';

import { InlineLogoComponent } from '../../../shell/ui/inline-logo/inline-logo.component';
import { UsersFacade } from '../state/users.facade';
import { CreateUserProperties } from '../state/users.model';

const CURRENCY_PARAMS: MaskitoNumberParams = {
  decimalSeparator: ',',
  thousandSeparator: '.',
  maximumFractionDigits: 2,
  postfix: ' €',
};

function currencyRangeValidator(min: number, max: number): ValidatorFn {
  return (control): ValidationErrors | null => {
    if (!control.value) {
      return null;
    }

    const value = maskitoParseNumber(String(control.value), CURRENCY_PARAMS);

    if (!Number.isFinite(value)) {
      return { number: { actual: control.value } };
    }

    if (value < min) {
      return { min: { min, actual: value } };
    }

    return value > max ? { max: { max, actual: value } } : null;
  };
}

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

  creatingUser = toSignal(this.usersFacade.creatingUser$);

  readonly currency: MaskitoOptions = maskitoNumber(CURRENCY_PARAMS);
  readonly maskPredicate: MaskitoElementPredicate = async (el) => {
    return (el as HTMLIonInputElement).getInputElement();
  };

  createUserForm = new FormGroup({
    name: new FormControl<string>('', {
      validators: [Validators.required],
      nonNullable: true,
    }),
    startingCapital: new FormControl<string>(
      maskitoTransform(this.config.startingCapital.initial.toString(), this.currency),
      {
        validators: [
          Validators.required,
          currencyRangeValidator(this.config.startingCapital.min, this.config.startingCapital.max),
        ],
        nonNullable: true,
      },
    ),
    monthlySavingsAmount: new FormControl<string>(
      maskitoTransform(this.config.monthlySavingsAmount.initial.toString(), this.currency),
      {
        validators: [
          Validators.required,
          currencyRangeValidator(
            this.config.monthlySavingsAmount.min,
            this.config.monthlySavingsAmount.max,
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
    return this.currencyError(
      this.startingCapital,
      this.config.startingCapital.min,
      this.config.startingCapital.max,
    );
  }

  get monthlySavingsAmountError(): string {
    return this.currencyError(
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
      startingCapital: maskitoParseNumber(rawProperties.startingCapital, CURRENCY_PARAMS),
      monthlySavingsAmount: maskitoParseNumber(rawProperties.monthlySavingsAmount, CURRENCY_PARAMS),
    };

    this.usersFacade.submitUser(properties);
  }

  private currencyError(control: FormControl<string>, minimum: number, maximum: number): string {
    if (control.hasError('required')) {
      return $localize`:@@featureUsers-createUserPage-error-numberRequired:Bitte gib einen Betrag ein.`;
    }

    if (control.hasError('number')) {
      return $localize`:@@featureUsers-createUserPage-error-numberInvalid:Bitte gib einen gültigen Geldbetrag ein.`;
    }

    if (control.hasError('min')) {
      return $localize`:@@featureUsers-createUserPage-error-numberMin:Der Betrag darf nicht unter ${minimum.toLocaleString('de-DE', { minimumFractionDigits: 2 })} € liegen.`;
    }

    if (control.hasError('max')) {
      return $localize`:@@featureUsers-createUserPage-error-numberMax:Der Betrag darf ${maximum.toLocaleString('de-DE', { minimumFractionDigits: 2 })} € nicht übersteigen.`;
    }

    return '';
  }
}
