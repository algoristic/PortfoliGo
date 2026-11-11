export interface LabNavItem {
  /** Path relative to `/lab`, e.g. `simulation`. */
  path: string;
  /** Bootstrap icon name without the `bi-` prefix. */
  icon: string;
  label: string;
}
