import { ComponentFixture, TestBed } from '@angular/core/testing';

import { IndicatorSpec } from '@app/analysis/domain/models/indicator.model';
import { ChartColor } from '@app/charts/ui/models/chart-color.model';

import { FormIndicatorComponent } from './form-indicator.component';
import { SubmittedIndicator } from './form-indicator.model';

import { byTestId, click, queryByTestId, select, textOf, typeText } from '../../../../testing/dom';

describe('FormIndicatorComponent', () => {
  let fixture: ComponentFixture<FormIndicatorComponent>;
  let submitted: SubmittedIndicator[];
  let root: HTMLElement;

  async function render(
    spec: IndicatorSpec,
    isNew: boolean,
    color: ChartColor = 'chart-1',
  ): Promise<void> {
    fixture = TestBed.createComponent(FormIndicatorComponent);
    fixture.componentRef.setInput('spec', spec);
    fixture.componentRef.setInput('color', color);
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
    expect(submitted).toEqual([
      { spec: { kind: 'bollinger', period: 30, multiplier: 2.5 }, color: 'chart-1' },
    ]);
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
      { spec: { kind: 'ema', period: 2 }, color: 'chart-1' },
      { spec: { kind: 'ema', period: 200 }, color: 'chart-1' },
    ]);
    expect(queryByTestId(root, 'market.instrument.indicator-form.period-error')).toBeNull();
  });

  it('starts from the parameters of an existing Bollinger indicator', async () => {
    await render({ kind: 'bollinger', period: 50, multiplier: 0.5 }, false, 'chart-4');
    expect(period().value).toBe('50');
    await submit();
    expect(submitted).toEqual([
      { spec: { kind: 'bollinger', period: 50, multiplier: 0.5 }, color: 'chart-4' },
    ]);
  });

  // AP 5.8: the colour is a named radio group of the six chart colours.
  it('offers the chart colours as a named radio group and submits the chosen one', async () => {
    await render({ kind: 'sma', period: 20 }, true, 'chart-3');
    const group = root.querySelector('[role="radiogroup"]');
    expect(group?.getAttribute('aria-label')).toBe('Farbe');
    const radios = Array.from(
      root.querySelectorAll<HTMLInputElement>('[role="radiogroup"] input[type="radio"]'),
    );
    expect(radios.map((radio) => radio.getAttribute('aria-label'))).toEqual([
      'Blau',
      'Orange',
      'Grün',
      'Violett',
      'Türkis',
      'Magenta',
    ]);
    expect(new Set(radios.map((radio) => radio.name)).size).toBe(1);
    expect(radios.filter((radio) => radio.checked).map((radio) => radio.value)).toEqual([
      'chart-3',
    ]);

    click(byTestId(root, 'market.instrument.indicator-form.color.chart-5'));
    await fixture.whenStable();
    // Another kind keeps the chosen colour.
    select(byTestId(root, 'market.instrument.indicator-form.kind'), 'ema');
    await fixture.whenStable();
    expect(
      byTestId<HTMLInputElement>(root, 'market.instrument.indicator-form.color.chart-5').checked,
    ).toBe(true);
    await submit();
    expect(submitted).toEqual([{ spec: { kind: 'ema', period: 20 }, color: 'chart-5' }]);
  });
});
