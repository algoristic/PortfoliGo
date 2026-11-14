/**
 * Names of a full storage (TS §9.5): `QuotaExceededError` in IndexedDB and localStorage of all
 * engines, `NS_ERROR_DOM_QUOTA_REACHED` in localStorage of older Firefox versions.
 */
const QUOTA_ERROR_NAMES: readonly string[] = ['QuotaExceededError', 'NS_ERROR_DOM_QUOTA_REACHED'];

/**
 * Whether `error` reports a full storage: by its `name`, also for errors of another realm (a
 * `DOMException` of the worker after structured cloning) and for an error that wraps one as `cause`.
 */
export function isQuotaExceeded(error: unknown): boolean {
  for (let current = error, depth = 0; depth < 4; depth++) {
    if (typeof current !== 'object' || current === null) {
      return false;
    }
    const { name, cause } = current as { name?: unknown; cause?: unknown };
    if ((QUOTA_ERROR_NAMES as readonly unknown[]).includes(name)) {
      return true;
    }
    current = cause;
  }
  return false;
}
