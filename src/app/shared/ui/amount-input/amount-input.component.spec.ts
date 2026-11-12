import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { form, FormField, required } from '@angular/forms/signals';

import { AmountInputComponent } from './amount-input.component';

import { byTestId, typeText } from '../../../../testing/dom';

interface AmountModel {
  amount: number | null;
}

@Component({
  selector: 'app-amount-input-host',
  imports: [AmountInputComponent, FormField],
  template: `
    <label for="amount">Betrag</label>
    <app-amount-input inputId="amount" testId="host.amount" [formField]="amountForm.amount">
    </app-amount-input>
  `,
})
class AmountInputHostComponent {
  amountModel = signal<AmountModel>({ amount: 1_000_000 });
  amountForm = form(this.amountModel, (path) => {
    required(path.amount);
  });
}

describe('AmountInputComponent', () => {
  let fixture: ComponentFixture<AmountInputHostComponent>;
  let host: AmountInputHostComponent;
  let field: HTMLInputElement;

  async function type(text: string): Promise<void> {
    typeText(field, text);
    await fixture.whenStable();
  }

  async function leave(): Promise<void> {
    field.dispatchEvent(new FocusEvent('blur'));
    await fixture.whenStable();
  }

  beforeEach(async () => {
    fixture = TestBed.createComponent(AmountInputHostComponent);
    host = fixture.componentInstance;
    await fixture.whenStable();
    field = byTestId<HTMLInputElement>(fixture.nativeElement, 'host.amount');
  });

  it('shows the model value in German format, named by the label', () => {
    expect(field.value).toBe('10.000');
    expect(field.labels?.[0]?.textContent).toBe('Betrag');
  });

  it('writes typed amounts to the model in cents and formats them when leaving', async () => {
    await type('1234,5');
    expect(host.amountModel().amount).toBe(123_450);
    expect(field.value).toBe('1234,5');

    await leave();
    expect(field.value).toBe('1.234,50');
    expect(host.amountForm.amount().touched()).toBe(true);
    expect(host.amountForm.amount().valid()).toBe(true);
  });

  it('shows a new model value', async () => {
    host.amountModel.set({ amount: 90_000 });
    await fixture.whenStable();
    expect(field.value).toBe('900');
  });

  it('reports text that is no amount to the field and keeps the last value', async () => {
    await type('12,345');
    await leave();
    const state = host.amountForm.amount();
    expect(host.amountModel().amount).toBe(1_000_000);
    expect(state.invalid()).toBe(true);
    expect(state.errors().map((error) => error.kind)).toEqual(['amount']);
    expect(field.value).toBe('12,345');
    expect(field.getAttribute('aria-invalid')).toBe('true');

    await type('12,34');
    expect(host.amountModel().amount).toBe(1_234);
    expect(host.amountForm.amount().valid()).toBe(true);
  });

  it('turns an empty input into null, which the required rule rejects', async () => {
    await type('  ');
    await leave();
    expect(host.amountModel().amount).toBeNull();
    expect(
      host.amountForm
        .amount()
        .errors()
        .map((error) => error.kind),
    ).toEqual(['required']);
    expect(field.value).toBe('');
  });
});
