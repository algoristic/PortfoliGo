/**
 * State of the game session in the UI (TS §11.3): `loading` until the engine answers `loadPlayer`,
 * `catching-up` during the catch-up (TS §3.7), `restarting` after a failed worker the service
 * starts again (TS §8.5); `locked`, `outdated` and `failed` end the session.
 */
export const SESSION_STATUSES = [
  'idle',
  'loading',
  'restarting',
  'catching-up',
  'ready',
  'locked',
  'outdated',
  'failed',
] as const;
export type SessionStatus = (typeof SESSION_STATUSES)[number];
