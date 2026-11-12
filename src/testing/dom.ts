// DOM helpers for page and component tests. Elements are found by `data-testid` (CLAUDE.md §3).

export function queryByTestId<T extends HTMLElement = HTMLElement>(
  root: ParentNode,
  testId: string,
): T | null {
  return root.querySelector<T>(`[data-testid="${testId}"]`);
}

export function byTestId<T extends HTMLElement = HTMLElement>(root: ParentNode, testId: string): T {
  const element = queryByTestId<T>(root, testId);
  if (element === null) {
    throw new Error(`No element with data-testid="${testId}"`);
  }
  return element;
}

/** Visible text with collapsed whitespace. */
export function textOf(element: Element): string {
  return (element.textContent ?? '').replace(/\s+/g, ' ').trim();
}

export function click(element: HTMLElement): void {
  element.click();
}

/** Sets the value like typing does and reports it with an `input` event. */
export function typeText(input: HTMLInputElement, value: string): void {
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

/** Turns the mouse wheel over the element; a positive `deltaY` zooms a chart out. */
export function wheel(element: Element, deltaY: number): void {
  element.dispatchEvent(
    new WheelEvent('wheel', {
      deltaY,
      bubbles: true,
      cancelable: true,
      clientX: 100,
      clientY: 100,
    }),
  );
}

// Browsers still set the legacy `keyCode`, and parts of the CDK (e.g. Escape in dialogs) read it.
const KEY_CODES: Record<string, number> = {
  Tab: 9,
  Enter: 13,
  Escape: 27,
  ' ': 32,
  End: 35,
  Home: 36,
  ArrowLeft: 37,
  ArrowUp: 38,
  ArrowRight: 39,
  ArrowDown: 40,
};

/** Presses a key on the element; widgets such as tabs, menus and dialogs react to `keydown`. */
export function press(element: Element, key: string): void {
  element.dispatchEvent(
    new KeyboardEvent('keydown', {
      key,
      keyCode: KEY_CODES[key] ?? 0,
      bubbles: true,
      cancelable: true,
    }),
  );
}

/** Chooses the option with `value` like the user does and reports it with a `change` event. */
export function select(element: HTMLSelectElement, value: string): void {
  element.value = value;
  element.dispatchEvent(new Event('change', { bubbles: true }));
}

/** Moves the focus away from the element like the user does; form fields count as touched then. */
export function blur(element: HTMLElement): void {
  element.dispatchEvent(new FocusEvent('blur'));
  element.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
}
