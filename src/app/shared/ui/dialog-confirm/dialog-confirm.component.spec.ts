import { Dialog } from '@angular/cdk/dialog';
import { ApplicationRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';

import { ConfirmDialogData } from './dialog-confirm.model';
import { openConfirmDialog } from './dialog-confirm.utils';

import { byTestId, click, press, queryByTestId, textOf } from '../../../../testing/dom';

describe('DialogConfirmComponent', () => {
  const data: ConfirmDialogData = {
    heading: 'Spieler löschen?',
    message: 'Der Spieler wird endgültig gelöscht.',
    confirmLabel: 'Löschen',
    tone: 'danger',
  };
  let opener: HTMLButtonElement;
  let result: Promise<boolean>;

  async function stable(): Promise<void> {
    await TestBed.inject(ApplicationRef).whenStable();
  }

  function dialogElement(): HTMLElement {
    const element = document.querySelector<HTMLElement>('[role="alertdialog"]');
    if (element === null) {
      throw new Error('The confirm dialog is not open');
    }
    return element;
  }

  beforeEach(async () => {
    opener = document.createElement('button');
    document.body.append(opener);
    opener.focus();
    result = firstValueFrom(openConfirmDialog(TestBed.inject(Dialog), data));
    await stable();
  });

  afterEach(() => opener.remove());

  it('shows the question with its accessible name and actions', () => {
    const dialog = dialogElement();
    expect(dialog.getAttribute('aria-label')).toBe(data.heading);
    // The CDK hides the rest of the page from assistive technology instead of `aria-modal`.
    expect(opener.getAttribute('aria-hidden')).toBe('true');
    expect(textOf(dialog)).toContain(data.message);
    expect(textOf(byTestId(dialog, 'dialog-confirm.confirm'))).toBe('Löschen');
    expect(textOf(byTestId(dialog, 'dialog-confirm.decline'))).toBe('Abbrechen');
  });

  it('yields true when the user confirms', async () => {
    click(byTestId(dialogElement(), 'dialog-confirm.confirm'));
    expect(await result).toBe(true);
  });

  it.each(['dialog-confirm.decline', 'dialog-confirm.close'])(
    'yields false when the user clicks %s',
    async (testId) => {
      click(byTestId(dialogElement(), testId));
      expect(await result).toBe(false);
    },
  );

  it('yields false when the user presses Escape', async () => {
    press(byTestId(dialogElement(), 'dialog-confirm.confirm'), 'Escape');
    expect(await result).toBe(false);
  });

  it('takes the focus and returns it to the element that opened it', async () => {
    expect(dialogElement().contains(document.activeElement)).toBe(true);
    click(byTestId(dialogElement(), 'dialog-confirm.decline'));
    await result;
    await stable();
    expect(queryByTestId(document.body, 'dialog-confirm.confirm')).toBeNull();
    expect(document.activeElement).toBe(opener);
  });
});
