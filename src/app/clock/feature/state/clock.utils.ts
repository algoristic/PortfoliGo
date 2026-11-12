import { FocusedElement } from '@app/clock/domain/models/clock-control.model';

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
