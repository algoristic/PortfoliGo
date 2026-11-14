import { GLOSSARY_TERMS } from './glossary';
import { GLOSSARY_CATEGORIES, GLOSSARY_TERM_IDS } from './models/glossary.model';

describe('GLOSSARY_TERMS', () => {
  it('lists every term exactly once', () => {
    const ids = GLOSSARY_TERMS.map((term) => term.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect([...ids].sort()).toEqual([...GLOSSARY_TERM_IDS].sort());
  });

  it('links only other existing terms, each once', () => {
    for (const term of GLOSSARY_TERMS) {
      expect(term.related.length).toBeGreaterThan(0);
      expect(new Set(term.related).size).toBe(term.related.length);
      expect(term.related).not.toContain(term.id);
      for (const related of term.related) {
        expect(GLOSSARY_TERM_IDS).toContain(related);
      }
    }
  });

  it('groups the terms of a category together and uses every category', () => {
    const categories = GLOSSARY_TERMS.map((term) => term.category).filter(
      (category, index, all) => index === 0 || all[index - 1] !== category,
    );
    expect(categories).toEqual([...GLOSSARY_CATEGORIES]);
  });

  it('gives anchors that are valid in a URL fragment and an element ID', () => {
    for (const term of GLOSSARY_TERMS) {
      expect(term.id).toMatch(/^[a-z]+(-[a-z]+)*$/);
    }
  });
});
