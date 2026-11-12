export interface NavItem {
  /** Path relative to the parent route, e.g. `markets`. */
  path: string;
  /** Bootstrap icon name without the `bi-` prefix. */
  icon: string;
  label: string;
}
