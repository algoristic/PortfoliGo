import { FocusedElement } from '@app/clock/domain/models/clock-control.model';
import { ClockPayload } from '@app/engine/data-access/service/engine-service.model';
import { BackgroundSettingsChange } from '@app/engine/domain/models/game-state.model';

/** What the shortcut rules need to know about `document.activeElement`. */
export function focusedElement(element: Element | null): FocusedElement | null {
  if (element === null) {
    return null;
  }
  return {
    tagName: element.tagName,
    role: element.getAttribute('role'),
    contentEditable: element.getAttribute('contenteditable'),
    isContentEditable: element instanceof HTMLElement && element.isContentEditable === true,
  };
}

/** Whether a clock event reports every background setting of `requested` (TS §3.6). */
export function confirmsBackground(
  clock: ClockPayload,
  requested: BackgroundSettingsChange,
): boolean {
  return (
    clock.backgroundMode === requested.mode &&
    (requested.speed === undefined || requested.speed === clock.backgroundSpeed) &&
    (requested.pauseAfter === undefined || requested.pauseAfter === clock.backgroundPauseAfter)
  );
}
