// jsdom has no layout, so a CDK virtual scroll viewport measures a height of 0 and renders only its
// buffer. Lists with virtual scrolling get a viewport height here; scrolling sets `scrollTop`, which
// jsdom keeps, and reports it with a `scroll` event like the browser does. jsdom also lacks
// `Element.scrollTo`, which the viewport calls to scroll to a row.

const VIEWPORT_CLASS = 'cdk-virtual-scroll-viewport';

/**
 * Gives every CDK virtual scroll viewport the client height `height` (in px). Call it before the
 * page is created: the viewport measures itself when it starts. Returns the cleanup.
 */
export function installScrollViewport(height: number): () => void {
  const original = Object.getOwnPropertyDescriptor(Element.prototype, 'clientHeight');
  const spy = vi.spyOn(Element.prototype, 'clientHeight', 'get').mockImplementation(function (
    this: Element,
  ) {
    return this.classList.contains(VIEWPORT_CLASS) ? height : (original?.get?.call(this) ?? 0);
  });
  const hadScrollTo = 'scrollTo' in Element.prototype;
  if (!hadScrollTo) {
    Element.prototype.scrollTo = function (this: Element, options?: ScrollToOptions | number) {
      const top = typeof options === 'object' ? options.top : undefined;
      if (top !== undefined) {
        scrollTo(this, top);
      }
    } as Element['scrollTo'];
  }
  return () => {
    spy.mockRestore();
    if (!hadScrollTo) {
      delete (Element.prototype as Partial<Element>).scrollTo;
    }
  };
}

/** Scrolls the element to `top` (in px) like the user does. */
export function scrollTo(element: Element, top: number): void {
  element.scrollTop = top;
  element.dispatchEvent(new Event('scroll'));
}
