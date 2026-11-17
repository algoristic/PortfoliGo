import { TestBed } from '@angular/core/testing';

import { dateTimeToTick } from '@app/clock/domain/calendar-logic';

import { DividendOverviewComponent } from './dividend-overview.component';

import { byTestId, textOf } from '../../../../testing/dom';

// Dividends per share have four decimal places in euros (TS §6.5, 7.1b-09): a share at 0,79 €
// paying 2,5 % quarterly announces 0,49 cents, which must not read as „0,00 €“.
describe('DividendOverviewComponent', () => {
  it('shows amounts per share below one cent with four decimal places', async () => {
    const fixture = TestBed.createComponent(DividendOverviewComponent);
    const exTick = dateTimeToTick({ year: 2030, month: 5, day: 14 });
    const paymentTick = dateTimeToTick({ year: 2030, month: 5, day: 16 });
    fixture.componentRef.setInput('dividends', {
      kind: 'stock',
      next: { exTick, paymentTick, cents: 0.49 },
      history: [
        {
          exTick: dateTimeToTick({ year: 2030, month: 2, day: 14 }),
          paymentTick: dateTimeToTick({ year: 2030, month: 2, day: 18 }),
          cents: 37.5,
        },
      ],
    });
    await fixture.whenStable();
    const root: HTMLElement = fixture.nativeElement;
    expect(textOf(byTestId(root, 'market.instrument.dividends.next.amount'))).toBe('0,0049 €');
    expect(textOf(byTestId(root, 'market.instrument.dividends.history.amount'))).toBe('0,375 €');
  });
});
