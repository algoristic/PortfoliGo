/** Texts an entry is found by: its label and further keywords (ticker, ISIN, synonyms). */
export interface SearchFields {
  label: string;
  keywords?: readonly string[];
}

/**
 * How well one search word matches an entry (TS §11.4, „Befehlspalette“), best first: a whole word
 * or keyword, the start of the label, the start of a word, anywhere in the label or a keyword, the
 * letters in order within one word that starts with the first of them („mrkt“ finds „Märkte“).
 */
export const MATCH_TIERS = {
  exact: 5,
  labelStart: 4,
  wordStart: 3,
  contained: 2,
  subsequence: 1,
} as const;

/** Lower case without diacritics, „ß“ as „ss“ and single spaces: „Märkte“ is found by „markte“. */
export function normalizeSearchText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/ß/g, 'ss')
    .replace(/\s+/g, ' ')
    .trim();
}

/** The words of a query; an empty or blank query has none. */
export function searchTokens(query: string): string[] {
  const normalized = normalizeSearchText(query);
  return normalized === '' ? [] : normalized.split(' ');
}

/**
 * Score of an entry for a query: the sum of the best tier of every query word, `null` when one word
 * doesn't match at all. A blank query matches every entry with 0.
 */
export function searchScore(fields: SearchFields, query: string): number | null {
  const label = normalizeSearchText(fields.label);
  const keywords = (fields.keywords ?? []).map(normalizeSearchText);
  const words = [...wordsOf(label), ...keywords.flatMap(wordsOf)];
  let score = 0;
  for (const token of searchTokens(query)) {
    const tier = tokenTier(token, label, keywords, words);
    if (tier === null) {
      return null;
    }
    score += tier;
  }
  return score;
}

/**
 * The matching entries, best score first; equal scores keep the order of `entries`. `limit` caps the
 * number of results.
 */
export function rankSearch<T>(
  entries: readonly T[],
  query: string,
  fieldsOf: (entry: T) => SearchFields,
  limit = Number.POSITIVE_INFINITY,
): T[] {
  return (
    entries
      .map((entry) => ({ entry, score: searchScore(fieldsOf(entry), query) }))
      .filter((hit): hit is { entry: T; score: number } => hit.score !== null)
      // `sort` is stable: equal scores keep the order of `entries`.
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((hit) => hit.entry)
  );
}

function tokenTier(
  token: string,
  label: string,
  keywords: readonly string[],
  words: readonly string[],
): number | null {
  if (words.includes(token) || keywords.includes(token)) {
    return MATCH_TIERS.exact;
  }
  if (label.startsWith(token)) {
    return MATCH_TIERS.labelStart;
  }
  if (words.some((word) => word.startsWith(token))) {
    return MATCH_TIERS.wordStart;
  }
  if (label.includes(token) || keywords.some((keyword) => keyword.includes(token))) {
    return MATCH_TIERS.contained;
  }
  return words.some((word) => word[0] === token[0] && isSubsequence(token, word))
    ? MATCH_TIERS.subsequence
    : null;
}

function wordsOf(text: string): string[] {
  return Array.from(text.matchAll(/[\p{L}\p{N}]+/gu), (match) => match[0]);
}

function isSubsequence(token: string, text: string): boolean {
  let position = 0;
  for (const char of token) {
    position = text.indexOf(char, position);
    if (position < 0) {
      return false;
    }
    position += 1;
  }
  return true;
}
