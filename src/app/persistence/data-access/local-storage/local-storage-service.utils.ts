import { VersionedEntry } from './local-storage-service.model';

export function isVersionedEntry(value: unknown): value is VersionedEntry<unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    'v' in value &&
    typeof value.v === 'number' &&
    'data' in value
  );
}
