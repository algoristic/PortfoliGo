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
