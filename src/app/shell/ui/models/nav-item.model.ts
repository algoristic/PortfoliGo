export interface NavItem {
  /** Path relative to the game area, e.g. `markets`. */
  path: string;
  /** Bootstrap icon name without the `bi-` prefix. */
  icon: string;
  label: string;
}
