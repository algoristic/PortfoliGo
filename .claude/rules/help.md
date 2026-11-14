---
paths:
  - 'src/app/help/**'
  - 'src/app/shared/ui/help-hint/**'
---

# Help: current state

What exists in the code, one bullet per AP. Update it when an AP changes this area (projektplan §2.4).

- Glossary and context help (AP 6.5, PS US-UI-06, TS §11.4): data in `help/domain` (`GLOSSARY_TERM_IDS`, `GLOSSARY_CATEGORIES`, `GLOSSARY_TERMS` with category and `related`; invariants in `glossary.spec.ts`), texts in `help/ui/labels/glossary-texts.ts` (`glossaryText(id)` → `term`, `keywords`, `short`, `details`; `glossaryCategoryLabel`; IDs `uiHelp-glossaryTexts-<idCamel>-…`). The texts follow the game's rules (TS §3, §6, §7, E-11, E-17); check them against the spec when a rule changes. A new term needs an ID, an entry in `GLOSSARY_TERMS` (grouped by category) and a case in `glossaryText`.
- `help/ui/glossary` (input `termId` = URL fragment): groups, search with `searchScore` (`shared/util/search-ranking.ts`) over term, keywords and short text in glossary order, result count (`help.glossary.result`, `role="status"`), entries `help.glossary.<id>` with `.short` and `.related.<id>` links (`[routerLink]="[]"` + fragment). The target entry gets `aria-current="location"`, scrolls into view (`scroll-mt-32`) and its `h3` takes the focus; a new target clears the search. Pages `/help` (`help/feature/help`, `help.back`) and `/game/:playerId/help` (`help/feature/game-help`); `HelpFacade.glossaryTermId$` reads `selectFragment` of the router store (`provideHelpState()` in the routes).
- Context help: `shared/ui/help-hint` (`app-help-hint`: inputs `term`, `text`, `link`, `fragment`, `testId`; 24 px „?“ button, CDK connected overlay with `role="dialog"`, `cdkTrapFocus` auto capture, Escape/outside click/close button; `.popover`, `.text`, `.link`, `.close`) and `help/ui/term-hint` (`<app-term-hint termId="spread">`, test IDs `help.hint.<id>…`; link from `GLOSSARY_LINK` in `term-hint/glossary-link.config.ts`, root default `/help`, `provideShellState()` provides `/game/:playerId/help`). Used in the order ticket (order types, validity), instrument quote (spread), instrument profile (TER), account card (overdraft), lot list (FIFO), performance figures (TWR, benchmark) and tax year (saver allowance, loss pot). Tests: `help.page.spec.ts`, `game-help.page.spec.ts`; axe and the keyboard journey in `e2e/accessibility.e2e.ts`.
