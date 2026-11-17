import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { Component, inject, signal } from '@angular/core';
import { disabled, form, FormField, FormRoot, required, validate } from '@angular/forms/signals';

import { dayIndex, dayStartTick } from '@app/clock/domain/calendar-logic';
import {
  parseDateTimeInput,
  toDateInputValue,
  toTimeInputValue,
} from '@app/clock/domain/game-time-input';
import { FormatGameTimePipe } from '@app/clock/ui/pipes/format-game-time/format-game-time.pipe';
import { jumpTargetTick, maxJumpTick } from '@app/engine/domain/jump-target-logic';
import { JumpTarget } from '@app/engine/domain/models/jump-target.model';
import { ButtonDirective } from '@app/shared/ui/button/button.directive';
import { DialogComponent } from '@app/shared/ui/dialog/dialog.component';

import { InputDirective } from '@app/shared/ui/input/input.directive';

import { JumpDialogData, JumpDialogResult, JumpFormModel } from './dialog-jump.model';

/** Targets of a jump (PS US-ZT-05, TS §3.7); the engine checks the target again. */
@Component({
  selector: 'app-dialog-jump',
  imports: [
    InputDirective,
    DialogComponent,
    ButtonDirective,
    FormField,
    FormRoot,
    FormatGameTimePipe,
  ],
  templateUrl: './dialog-jump.component.html',
  host: { class: 'block' },
})
export class DialogJumpComponent {
  readonly #dialogRef = inject<DialogRef<JumpDialogResult>>(DialogRef);
  data = inject<JumpDialogData>(DIALOG_DATA);

  nextOpenTick = jumpTargetTick({ kind: 'next-open' }, this.data.now, this.data.sessions);
  nextMonthTick = jumpTargetTick({ kind: 'next-month' }, this.data.now, this.data.sessions);
  minDate = toDateInputValue(this.data.now);
  maxDate = toDateInputValue(maxJumpTick(this.data.now));

  jumpModel = signal<JumpFormModel>({
    kind: this.nextOpenTick === null ? 'next-month' : 'next-open',
    // The next day at 00:00 as a starting point for an own date.
    date: toDateInputValue(dayStartTick(dayIndex(this.data.now) + 1)),
    time: toTimeInputValue(dayStartTick(dayIndex(this.data.now) + 1)),
  });
  jumpForm = form(
    this.jumpModel,
    (path) => {
      disabled(path.date, ({ valueOf }) => valueOf(path.kind) !== 'date');
      disabled(path.time, ({ valueOf }) => valueOf(path.kind) !== 'date');
      required(path.date, {
        when: ({ valueOf }) => valueOf(path.kind) === 'date',
        message: $localize`:@@featureClock-dialogJump-dateRequired:Bitte gib ein Datum ein.`,
      });
      validate(path.date, ({ value, valueOf }) => {
        if (valueOf(path.kind) !== 'date' || value() === '') {
          return null;
        }
        const tick = parseDateTimeInput(value(), valueOf(path.time));
        if (tick === null) {
          return {
            kind: 'invalid',
            message: $localize`:@@featureClock-dialogJump-dateInvalid:Bitte gib ein gültiges Datum und eine Uhrzeit ein.`,
          };
        }
        if (tick <= this.data.now) {
          return {
            kind: 'not-in-future',
            message: $localize`:@@featureClock-dialogJump-dateNotInFuture:Der Zeitpunkt muss nach der aktuellen Spielzeit liegen.`,
          };
        }
        if (tick > maxJumpTick(this.data.now)) {
          return {
            kind: 'too-far',
            message: $localize`:@@featureClock-dialogJump-dateTooFar:Du kannst höchstens ein Jahr vorspulen.`,
          };
        }
        return null;
      });
    },
    {
      submission: {
        action: async (field) => this.#dialogRef.close(this.#target(field().value())),
      },
    },
  );

  heading = $localize`:@@featureClock-dialogJump-heading:Vorspulen`;

  decline(): void {
    this.#dialogRef.close();
  }

  #target({ kind, date, time }: JumpFormModel): JumpTarget | undefined {
    if (kind !== 'date') {
      return { kind };
    }
    const tick = parseDateTimeInput(date, time);
    return tick === null ? undefined : { kind, tick };
  }
}
