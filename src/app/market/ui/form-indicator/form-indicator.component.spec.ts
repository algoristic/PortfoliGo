import { ComponentFixture, TestBed } from '@angular/core/testing';

import { IndicatorSpec } from '@app/analysis/domain/models/indicator.model';

import { FormIndicatorComponent } from './form-indicator.component';

import { byTestId, click, queryByTestId, select, textOf, typeText } from '../../../../testing/dom';

describe('FormIndicatorComponent', () => {
  let fixture: ComponentFixture<FormIndicatorComponent>;
  let submitted: IndicatorSpec[];
  let root: HTMLElement;

  async function render(spec: IndicatorSpec, isNew: boolean): Promise<void> {
    fixture = TestBed.createComponent(FormIndicatorComponent);
    fixture.componentRef.setInput('spec', spec);
    fixture.componentRef.setInput('isNew', isNew);
    submitted = [];
    fixture.componentInstance.submittedIndicator.subscribe((value) => submitted.push(value));
    root = fixture.nativeElement;
    await fixture.whenStable();
  }

  function period(): HTMLInputElement {
    return byTestId<HTMLInputElement>(root, 'market.instrument.indicator-form.period');
  }

  async function submit(): Promise<void> {
    click(byTestId(root, 'market.instrument.indicator-form.submit'));
    await fixture.whenStable();
  }

  it('starts a new indicator from the defaults of the chosen kind', async () => {
    await render({ kind: 'sma', period: 20 }, true);
    expect(period().value).toBe('20');
    expect(queryByTestId(root, 'market.instrument.indicator-form.multiplier')).toBeNull();

    select(byTestId(root, 'market.instrument.indicator-form.kind'), 'smma');
    await fixture.whenStable();
    expect(period().value).toBe('14');

    select(byTestId(root, 'market.instrument.indicator-form.kind'), 'bollinger');
    await fixture.whenStable();
    expect(period().value).toBe('20');
    const multiplier = byTestId<HTMLSelectElement>(
      root,
      'market.instrument.indicator-form.multiplier',
    );
    expect(multiplier.value).toBe('2');
    expect([...multiplier.options].map((option) => option.textContent?.trim())).toEqual([
      '0,5',
      '1,0',
      '1,5',
      '2,0',
      '2,5',
      '3,0',
      '3,5',
      '4,0',
    ]);

    select(multiplier, '2.5');
    typeText(period(), '30');
    await submit();
    expect(submitted).toEqual([{ kind: 'bollinger', period: 30, multiplier: 2.5 }]);
  });

  it.each(['1', '201', '20.5', ''])('rejects the period %j', async (value) => {
    await render({ kind: 'ema', period: 20 }, false);
    typeText(period(), value);
    await submit();
    expect(submitted).toEqual([]);
    expect(textOf(byTestId(root, 'market.instrument.indicator-form.period-error'))).toBe(
      'Bitte gib eine ganze Zahl von 2 bis 200 ein.',
    );
    expect(period().getAttribute('aria-invalid')).toBe('true');
  });

  it('accepts the bounds and keeps the kind of an existing indicator', async () => {
    await render({ kind: 'ema', period: 20 }, false);
    expect(queryByTestId(root, 'market.instrument.indicator-form.kind')).toBeNull();
    typeText(period(), '2');
    await submit();
    typeText(period(), '200');
    await submit();
    expect(submitted).toEqual([
      { kind: 'ema', period: 2 },
      { kind: 'ema', period: 200 },
    ]);
    expect(queryByTestId(root, 'market.instrument.indicator-form.period-error')).toBeNull();
  });

  it('starts from the parameters of an existing Bollinger indicator', async () => {
    await render({ kind: 'bollinger', period: 50, multiplier: 0.5 }, false);
    expect(period().value).toBe('50');
    await submit();
    expect(submitted).toEqual([{ kind: 'bollinger', period: 50, multiplier: 0.5 }]);
  });
});
