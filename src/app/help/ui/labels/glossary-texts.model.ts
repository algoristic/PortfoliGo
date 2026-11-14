export interface GlossaryText {
  term: string;
  /** Further search words, separated by spaces. */
  keywords: string;
  /** One or two sentences for the context help and the start of the entry. */
  short: string;
  details: string;
}
