import { Dialog, DialogRef } from '@angular/cdk/dialog';
import { firstValueFrom, of } from 'rxjs';
import type { Mocked } from 'vitest';

import { DialogConfirmComponent } from './dialog-confirm.component';
import { ConfirmDialogData } from './dialog-confirm.model';
import { openConfirmDialog } from './dialog-confirm.utils';

describe('openConfirmDialog', () => {
  const data: ConfirmDialogData = { heading: 'Spieler löschen?', message: 'Endgültig.' };
  let dialog: Mocked<Pick<Dialog, 'open'>>;

  function closeWith(result: boolean | undefined): void {
    dialog.open.mockReturnValue({ closed: of(result) } as unknown as DialogRef<unknown, unknown>);
  }

  beforeEach(() => {
    dialog = { open: vi.fn() };
  });

  it('opens the confirm dialog with the data as its accessible name', async () => {
    closeWith(true);
    await firstValueFrom(openConfirmDialog(dialog, data));
    expect(dialog.open).toHaveBeenCalledWith(
      DialogConfirmComponent,
      expect.objectContaining({ data, ariaLabel: data.heading, role: 'alertdialog' }),
    );
  });

  it('emits true when confirmed', async () => {
    closeWith(true);
    expect(await firstValueFrom(openConfirmDialog(dialog, data))).toBe(true);
  });

  it('emits false when declined', async () => {
    closeWith(false);
    expect(await firstValueFrom(openConfirmDialog(dialog, data))).toBe(false);
  });

  it('emits false when closed via Escape or the backdrop', async () => {
    closeWith(undefined);
    expect(await firstValueFrom(openConfirmDialog(dialog, data))).toBe(false);
  });
});
