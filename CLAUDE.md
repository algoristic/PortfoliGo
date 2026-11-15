# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Rules for implementing Angular code in this repository, so that generated code looks like code a team member would write. If a `CLAUDE.md` in a parent directory says something different, this file wins.

## Project context

**PortfoliGo** is a browser-based stock-market and personal-finance simulation game (PWA, German UI). The source of truth for what to build lives in `docs/`, and planning information lives only there:

- `docs/specs/produktspezifikation.md` (PS): vision, domain model, user stories (`US-xx-nn`), UI/UX concept.
- `docs/specs/technische-spezifikation.md` (TS): architecture, time and market model, engine, persistence, frontend architecture (§11), decisions `E-xx` (§16).
- `docs/projektplan.md`: milestones M0–M10 (stage 1 done, stage 2 planned) split into work packages (`AP x.y`), status table (§4), open decisions (§3).
- `docs/aenderungsprotokoll.md`: change log, newest entries first; read the latest entries and those of the AP's dependencies, not the whole file.

**Session workflow:** Work happens one AP at a time ("Setze AP x.y aus `docs/projektplan.md` um"). Follow projektplan §2.3 and the Definition of Done in §2.4:

- Check that the AP's dependencies are done.
- Ask before building on a decision that is still "Vorschlag".
- Update the status, the change log (new entry at the top) and the rule files in `.claude/rules/` of the areas the AP changed.
- If the implementation deviates from the spec, update the spec.

**Current state:** What exists in the code is documented per area in path-scoped rules, `.claude/rules/<area>.md`, grouped by topic. Claude Code loads a rule file automatically once a file matching its `paths` is read or edited. **Before planning an AP, read the rule files of the areas it touches**; after an AP, work the changes into the matching topic of each file (projektplan §2.4). A new area gets its own rule file and a row in this table.

| Area (rule file)   | Paths                                                 | Contents                                                                                     |
| ------------------ | ----------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `shell.md`         | `shell`, app root, `main.ts`, `index.html`            | bootstrap, `provideAppCore()`, routes, game shell, session guards and overlay (AP 0.4, 2.5)  |
| `shared.md`        | `shared`, `lab/feature/components`                    | UI building blocks, money and price grid, formatting functions and pipes (AP 0.3, 0.4)       |
| `simulation.md`    | `simulation`                                          | determinism toolkit: seeds, streams, distributions, `detExp`/`detLog`, `Checksum` (AP 1.1)   |
| `clock.md`         | `clock`                                               | time model, trading hours, clock slice, clock bar, market status, jump dialog (AP 1.2, 2.5)  |
| `world.md`         | `world`                                               | world generation (AP 1.3)                                                                    |
| `market.md`        | `market`, `lab/domain/calibration*`                   | market model, prices, candles, dividends, indices, ETFs, quotes, calibration (AP 1.4–1.9)    |
| `lab.md`           | `lab`, `charts`, `analysis`                           | simulation lab, price chart, statistics (AP 1.7, 1.8)                                        |
| `engine.md`        | `engine`, `persistence`                               | game engine, worker host, `EngineService`, persistence, session slice (AP 0.3, 2.1–2.3, 2.5) |
| `players.md`       | `players`                                             | player profiles, `PlayersService`, players slice and pages (AP 2.4)                          |
| `settings.md`      | `settings`, `index.html`                              | device and player settings (AP 2.6)                                                          |
| `banking.md`       | `banking`, `taxes`, banking parts of `engine/domain`  | ledger, accounts, bank run, interest, taxes, bank commands, statement, banks (AP 3.1–3.5)    |
| `notifications.md` | `notifications`, `engine/domain/notification-system*` | notifications, auto-pause, absence report (AP 3.6)                                           |
| `dashboard.md`     | `dashboard`, `engine/domain/upcoming-inputs*`         | dashboard tiles, „Demnächst“, „Erste Schritte“ (AP 5.7b)                                     |
| `trading.md`       | `trading`, `engine/domain/order-*`                    | order rules, orders in the engine, order commands and projection (AP 5.1)                    |
| `about.md`         | `about`                                               | about page, legal notes, licences, `APP_VERSION`, disclaimer hint (AP 6.5)                   |
| `help.md`          | `help`, `shared/ui/help-hint`                         | glossary data and texts, glossary pages, context help (AP 6.5)                               |
| `pwa.md`           | `pwa`, `ngsw-config.json`, manifest, icon script      | service worker, manifest per language, update notice, installation, storage (AP 6.3, 6.8b)   |
| `testing.md`       | `*.spec.ts`, `e2e`, `src/testing`                     | test suites, helpers, fixtures, page tests of the game area (AP 0.5, 2.5)                    |
| `testing-guide.md` | `*.spec.ts`, `e2e`, `src/testing`, test configs       | how to write tests: principles, fixtures, page, system and mutation tests (§10)              |

Rules that apply everywhere:

- Reuse the UI building blocks of `shared/ui` (catalogue at `#/lab/components`; tabs and menus use `@angular/aria`, E-16; everything else from the CDK).
- Templates format only through the pipes in `shared/ui/pipes` and `clock/ui/pipes` over the functions in `shared/util`; never round or format ad hoc.
- Simulation code uses the toolkit in `simulation/util` instead of `Math.random`/`Math.exp`/`Math.log`/`**`; an ESLint rule enforces this in `simulation`, `world`, `market` and `clock` (`domain`, `util`), in the `domain` folders of `engine`, `banking`, `trading`, `portfolio`, `taxes` and `dashboard`, and in `shared/domain` (`eslint.config.js`).
- Convert game time only via the `TICKS_PER_*` constants of `clock/domain`, never with literal `60`/`1440`.
- Check every change to the market model or the world with `npm run test:calibration`; recalibrate instead of widening bands (the bands are decisions of the product owner).
- `npm run verify` is green. CI runs the gate on every push (TS §14.4): `build-latest.yml` (format, lint, types, `logic`, `angular`, build with bundle budget, system tests in Chromium without the J10 budgets) must pass before `publish.yml` deploys; `verify.yml` would run the rest (`calibration`, `perf`, `mutation`, J10 budgets tagged `@budget`, Firefox, WebKit, phones) without blocking the deployment, but for now only on demand (`workflow_dispatch`): run these checks locally before pushing (`npm run test:calibration`, `npm run test:perf`, `npm run test:mutation`, `npx playwright test`). Fix a red extended check like a red gate.
- Environment values (`src/environments/`): `production`, `storeDevtools` (`null` = off) and `devPages` (flag for the lab and developer pages; for now `true` in production as well, so all visitors reach the lab). Only bootstrap code imports them.
- An earlier Ionic prototype was deleted; don't build on it. View prototype code with `git show 9bab719^:<path>`.

**Architecture (TS §2, §11):**

- A pure, deterministic `GameEngine` runs in a Web Worker and is authoritative for all game rules.
- The UI sends commands through the `EngineService`, and NgRx holds only throttled projections (slices from AP 2.5, TS §11.3).
- Market prices are a pure function of seed, simulation version and game time (`priceAt`, bridge model, E-20).
- Simulation code follows the determinism rules in TS §4.5.
- Domain folders and slices follow TS §11.1 and §11.3.
- The additions and exceptions from TS §11.2 are part of this file since AP 0.2 (marked as exceptions where they deviate).

**Repo facts the rules below don't state:**

- Component/directive prefix `app`; eslint enforces the class suffixes `Page`/`Component`.
- Prettier `printWidth` is 100.
- Path alias `@app/*` → `src/app/*` (`tsconfig.json` `paths`; eslint treats it as an internal import group).
- Styling uses Tailwind CSS v4 with the semantic `--pgo-*` tokens in `src/styles.css` (§4). No UI framework besides the Angular CDK. Every new runtime dependency needs an entry in TS §16.
- **Exact dependency versions:** every version in `package.json` is pinned exactly (`"4.3.5"`), never a range with `^`, `~`, `>=` or `*`. The project `.npmrc` sets `save-exact=true`, so `npm i <pkg>` saves exact versions; check `package.json` after installing anyway. Updates are deliberate version bumps.
- `npm run build` writes to `www/`. Every push to `main` builds and deploys via SFTP (`.github/workflows/publish.yml`).
- Specs of `domain` and `util` run with plain Vitest under Node (`vitest.config.ts`), all others with Vitest under jsdom through `ng test` (`@angular/build:unit-test`, setup in `src/test-setup.ts`); system tests run with Playwright (§10, TS §14.1). Commands are in §11.

**Checking changes in the browser:** after implementing UI changes, check them in the real app with the Playwright MCP server (`.mcp.json`: headless Google Chrome, fresh profile per session) against the dev server on port 4711. If the server isn't running, start it with the command from `.claude/launch.json` (selects Node via nvm, no `--open`). Navigate to the affected page, go through the flows by `data-testid`, read the console and take screenshots for layout questions. Playwright writes its output to `.playwright-mcp/` (git-ignored); close the browser when done. This complements the page and system tests and doesn't replace them. A new machine needs Google Chrome and nvm in `~/.nvm`.

## 0. How to use this file

- **When editing existing files, keep them internally consistent.** Don't mix styles within one file, and don't refactor unrelated code unless you are asked to.
- When this file and the surrounding code disagree, ask instead of guessing.
- Reuse existing services, tokens, validators and helpers before building new ones.

## 1. Architecture: domains and layers

Code is grouped by domain first, then by layer: `src/app/<domain>/<layer>/…`, e.g. `users/feature`, `users/data-access`, `users/domain`. The app root (`main.ts`, root component, root routes) only bootstraps and wires things up. All functionality lives in the domain folders.

| Layer         | Contains                                                                     | May depend on                          |
| ------------- | ---------------------------------------------------------------------------- | -------------------------------------- |
| `feature`     | routes, pages, smart components, NgRx state (actions/reducer/effects/facade) | feature, ui, data-access, domain, util |
| `ui`          | presentational components (inputs/outputs only), pipes, form components      | ui, domain, util                       |
| `data-access` | HTTP/WebSocket/storage services, config tokens, mock interceptors            | data-access, domain, util              |
| `domain`      | models (interfaces, `as const` lists) and pure domain logic                  | domain, util                           |
| `util`        | generic helpers without domain knowledge                                     | util                                   |

ESLint enforces these rules (`no-restricted-imports` per layer in `eslint.config.js`, matched on the import path, including the framework-free rule below; specs are exempt). If a dependency doesn't fit, move the code to the right layer instead of importing across or silencing the rule.

- **Smart and presentational:** `feature` holds pages and the components that inject a facade. Everything presentational lives in `ui`, also when only one page uses it.

- **Framework-free layers:** `domain` and `util` import nothing from `@angular/*`, `@ngrx/*` or `rxjs`. That way the code runs in the Web Worker and in the logic tests under Node.
- **Worker:** the engine worker imports only `domain`, `util` and framework-free persistence modules, and never creates an Angular injector. Simulation code follows the determinism rules in TS §4.5.
- **Texts and access:** user-facing texts exist only in Angular (i18n, §5); the engine returns codes, which the `feature` or `ui` layer maps to `$localize` texts. Components never access IndexedDB, localStorage or the worker directly, only through facades.

## 2. Folder structure per layer

**feature:**

```
<domain>/feature/
├── <domain>.routes.ts              # export const <domain>Routes: Routes
├── <name>/                         # routed page <name>.page.{ts,html} or smart component <name>.component.{ts,html}
├── dialog-*/                       # dialog content
└── state/
    ├── <domain>.actions.ts
    ├── <domain>.reducer.ts
    ├── <domain>.selectors.ts
    ├── <domain>.effects.ts
    ├── <domain>.facade.ts
    ├── <domain>.guards.ts          # enter/leave guard factories
    ├── <domain>.providers.ts       # provide<Domain>State()
    ├── <domain>.model.ts           # state-related types (e.g. submitted payloads)
    └── <domain>.utils.ts           # pure helpers for effects/reducer
```

**ui:** one folder per component or directive, named after what it shows (`return-histogram`, `bottom-nav`, `form-*`, `dialog-*`, see §3). Component-specific types go in a sibling `<component>.model.ts`; types that several components of the same `ui` folder share go in `models/<name>.model.ts`. Pipes live under `pipes/<name>/<name>.pipe.ts`. A `.scss` file exists only for special styles (§4).

**data-access:**

```
<domain>/data-access/service/
├── <name>.service.ts               # <Name>Service
├── <name>-service.providers.ts     # provide<Name>Service()
├── <name>-service.config.ts        # <Name>ServiceConfig + <NAME>_SERVICE_CONFIG token
├── <name>-service.mock.ts          # <name>ServiceMock: HttpInterceptorFn
├── <name>-service.model.ts         # transport-only types (events, payloads)
├── <name>-service.utils.ts         # type guards etc.
└── mock-*.data.json                # mock fixtures
```

**domain:** models in `models/<name>.model.ts`. Pure domain functions go in `*-logic.ts` or `*.utils.ts` if needed.

## 3. Components and templates

### Naming and metadata

- Routed pages are named `<name>.page.{ts,html}` with the class `<Name>Page` and the selector `app-<name>-page`. All other components are named `<name>.component.{ts,html}` with the class `<Name>Component` and the selector `app-<name>`.
- Directives are named `<name>.directive.ts` with the class `<Name>Directive` and an attribute selector `app<Name>` (eslint enforces prefix and style), limited to native elements where that matters (`button[appButton]`, `i[appIcon]`).
- Names describe what a component shows (`header`, `bottom-nav`, `return-histogram`, `world-tables`); whether it is smart or presentational follows from its layer (§1). Only two role prefixes remain: `dialog-` for dialog content and `form-` for form components. Don't add others such as `section-`.
- Standalone is implicit, so don't write `standalone: true`. NgModules are not used.
- Metadata order is `selector`, `imports`, `templateUrl`, `styleUrl` (singular), `host`. The template is always a separate file. A `.scss` file and `styleUrl` exist only when the component needs special styles (§4); no empty `.scss` files.
- Set the host's display through the host class, `host: { class: 'block' }` (or `inline-block`, …), never with `:host { display }` (§4).
- Don't set `changeDetection`. The framework default applies (OnPush since Angular 22).
- Write code that works zoneless: everything the template shows must come from signals, the `async` pipe or template events. Never assign plain fields from subscriptions, promises or timers and expect the view to update. Don't use `NgZone`.
- `imports`:
  - `CommonModule` when the template needs common pipes such as `async`.
  - `RouterModule` for router directives.
  - Import UI library components the way the library exports them (standalone components or NgModules), and only those the template uses.

### Class members

```ts
// feature component; ui components inject no app services (see "ui layer"), only inputs/outputs
export class OrderItemsComponent {
  facade = inject(OrdersFacade); // read by the template → public, no modifier
  readonly #router = inject(Router); // only used in the class → private field

  items = input.required<OrderItem[]>();
  activeItem = input<string>();
  countries = input<Country[] | null>(); // fed from `| async` → allow null

  selectedItem = output<string>(); // outputs are past-tense events
  clickedBack = output<void>();

  itemCount = computed(() => this.items().length);
  order = toSignal(this.facade.order$); // only if the class (not the template) needs the value

  title = $localize`:@@featureOrders-orderItems-title:Positionen`;

  onSelectItem(itemId: string): void {
    this.selectedItem.emit(itemId);
  }

  #formatLabel(item: OrderItem): string {
    return `${item.position} – ${item.name}`;
  }
}
```

- DI uses only `inject()` field initializers, never constructor injection.
- Visibility:
  - Template-facing members have no modifier. Don't use `protected`.
  - Class-only members are ECMAScript private fields: `readonly #router = inject(Router)`, `#formatLabel(…)`. Don't use the `private` keyword or a `_` prefix.
- Signal APIs only: `input()`, `input.required()`, `output()`, `model()` (only for custom form controls), `computed()`, `linkedSignal()`, `viewChild()`; never `@Input()`, `@Output()`, `EventEmitter` or `@ViewChild`. Don't put `readonly` on them.
- Outputs are named as past-tense events: `clickedBack`, `selectedItem`, `submittedOrderDetails`, `markedFile`.
- Template handlers are named `onX(...)` (`onSelectItem`). For form or dialog actions use plain verbs (`submit()`, `confirm()`, `decline()`).
- Member order:
  1. `inject()`
  2. inputs
  3. constants
  4. outputs
  5. view queries
  6. derived state (`computed`, `toSignal`)
  7. `$localize` labels
  8. lifecycle hooks
  9. handlers
  10. private helpers
- Methods have explicit return types. Lifecycle hooks come with `implements OnInit` etc.
- **No manual `.subscribe()` in components** and no `unsubscribe$` subject with `takeUntil` and `ngOnDestroy`. Read state through `@let … | async` in the template or `toSignal()`. If a subscription is unavoidable, use `takeUntilDestroyed()`.

### Templates

```angular
@let order = ordersFacade.order$ | async;
@let markedItemIds = ordersFacade.markedItemIds$ | async;
@let isMaxOneMarked = (markedItemIds ?? []).length < 2;

@if (order && isMaxOneMarked) {
  @for (item of order.items; track item.id) {
    <app-order-item [item]="item" (selectedItem)="onSelectItem($event)"></app-order-item>
  }
}
```

- Collect all stream reads in a `@let x = facade.x$ | async;` block at the top of the template.
- Use only built-in control flow (`@if`, `@for`, `@switch`, `@defer`), never `*ngIf`/`*ngFor`.
- `@for` always tracks by an identity field (`track item.id`), or by `$index` for primitives.
- To unwrap a signal under the same name, use an underscore alias: `@let _form = form();`.
- Templates call no methods except event handlers. Format values with the pipes from `shared/ui/pipes` and `clock/ui/pipes` (`{{ ratio | formatPercent: 1 }}`; they show `–` for `null`, `undefined` and non-finite values) and derive everything else as `computed`, e.g. a row view model with label and texts.
- **`data-testid` on interactive elements** (buttons, inputs, list entries, dialog actions). Use the dot-separated scheme `<feature>.<area>.<element>`, e.g. `data-testid="orders.create-order.submit"`. For dynamic values write `[attr.data-testid]="'orders.item-list.' + id + '.toggle-collapse'"`.

### Forms

New forms use **Signal Forms** (`@angular/forms/signals`). Don't use Reactive Forms (`FormGroup`, `FormControl`), template-driven forms or `ngModel`. Existing Reactive Forms stay as they are until a migration is requested (see §0), and a component never mixes both APIs.

```ts
export class FormGeneralInformationComponent {
  info = input.required<GeneralInformation>();

  submittedGeneralInformation = output<GeneralInformationModel>();

  generalInformationModel = linkedSignal<GeneralInformationModel>(() => ({
    name: this.info().name,
  }));
  generalInformationForm = form(
    this.generalInformationModel,
    (path) => {
      required(path.name, {
        message: $localize`:@@uiOrders-formGeneralInformation-nameRequired:Bitte gib einen Namen ein.`,
      });
    },
    {
      submission: {
        action: async (field) => this.submittedGeneralInformation.emit(field().value()),
      },
    },
  );
}
```

```angular
@let _name = generalInformationForm.name();

<form [formRoot]="generalInformationForm">
  <input [formField]="generalInformationForm.name" data-testid="orders.general-information.name" />
  @if (_name.touched() && _name.invalid()) {
    @for (error of _name.errors(); track error.kind) {
      <span>{{ error.message }}</span>
    }
  }
  <button
    type="submit"
    data-testid="orders.general-information.submit"
    i18n="@@uiOrders-formGeneralInformation-submit">
    Speichern
  </button>
</form>
```

- **Model:** a writable signal that holds exactly the values the controls edit (e.g. strings for masked inputs). Its type goes in the component's `*.model.ts`. Name the pair `<name>Model` and `<name>Form`.
  - Empty forms start from `signal({...})`.
  - Forms filled from an input use `linkedSignal(() => …)`. It resets when the input changes, and user edits stay local. Don't build forms inside `computed()`.
  - If the input can receive new references for the same entity while the user is editing (polling, selectors that project new objects), reset only on identity change: `linkedSignal({ source: this.#infoId, computation: () => ({ name: untracked(this.info).name }) })` with `#infoId = computed(() => this.info().id)`. The key must be its own `computed`, because a `source: () => this.info().id` would still make the linked signal depend on `info` itself.

- **Schema:** validation and field state (`disabled`, `hidden`, `readonly`) are declared in the schema function, reactive via `when`, and never toggled imperatively from effects. Write `$localize` messages inline in the schema (`message:`); the schema runs when `form()` is created, before class-field labels exist.
  - Custom rules: `validate(path.x, ({ value }) => (… ? { kind: 'x', message: … } : null))`. Async rules use `validateAsync`/`validateHttp`.
  - Reusable rule sets are `schema<T>(…)` constants or functions that take a `SchemaPath`. **Exception:** they live in the `ui` layer (like pipes); the pure check and formatting functions they call live in `domain` or `util`.
- **Binding:** import `FormField` and `FormRoot` from `@angular/forms/signals` and bind every control with `[formField]`. This works for native inputs, for custom controls that implement `FormValueControl`/`FormCheckboxControl`, and for third-party components through their `ControlValueAccessor`. New custom controls implement `FormValueControl` (`value = model<T>()`), not `ControlValueAccessor`.
- **Submission:** define `submission.action` in the `form()` options and bind `<form [formRoot]="xForm">`. Submitting marks all fields as touched and runs the action only when the form is valid. A form component maps the model if needed and emits a typed result through an output (`submittedGeneralInformation`); saving happens in the feature layer.
- **Template state:** read field state through its signals (`xForm.name().invalid()`, `.touched()`, `.errors()`) and show errors only for touched fields.
- Don't use `@angular/forms/signals/compat` unless a migration is explicitly requested.

### Dialogs

- Dialog content components live in `dialog-<name>/` (never `<name>-dialog`).
- Open dialogs typed, with data and result types in the dialog's `*.model.ts`.
- Open dialogs from **effects**, not from ui components. Map the closed result to an action, e.g. `filter(Boolean), map(() => action)`. Confirmations use a shared confirm dialog instead of ad-hoc ones.

### ui layer

ui components are purely presentational, with data in through inputs and events out through outputs. No facades, `Store`, services, `Router` or dialogs. Framework and platform tokens are fine (`ElementRef`, `DestroyRef`, `Renderer2`, `PendingTasks`, `TemplateRef`, `DOCUMENT`), as are router directives such as `routerLink` in templates.

**Exception (own UI library, TS §11.2 point 8):** `shared/ui` plays the role of a component library. It contains the `ToastService` (provided once at bootstrap via `provideToastService()`) and `openConfirmDialog(dialog, data)`, and the confirm dialog injects `DialogRef`/`DIALOG_DATA`. Effects use these for toasts and confirmations; components in other `ui` folders still don't. Every `shared/ui` building block has an example on `#/lab/components` (`lab/feature/components`).

## 4. Styling

Styling uses **Tailwind CSS v4** with semantic tokens (TS §11.5). `src/styles.css` is the only global stylesheet: it imports Tailwind, defines the `--pgo-*` tokens for light (`:root`, `.light`) and dark (`.dark`) and maps them to Tailwind colours via `@theme inline`. The default palette is disabled.

- **Templates use utility classes**, colours only from the tokens: `bg-bg`, `bg-surface`, `bg-surface-raised`, `border-border`, `text-fg`, `text-fg-muted`, `text-accent`, `text-up`, `text-down`, `text-warning`. Spacing, sizes and typography come from Tailwind's scale.
- **No arbitrary values** (`p-[13px]`, `bg-[#123456]`) and no default colours (`bg-red-500` produces no styles anyway). New colours are new tokens in `src/styles.css`, with text contrast ≥ 4.5:1 in both themes (check on `#/lab/tokens`).
- Write class names in full. Tailwind finds classes by scanning the sources, so don't assemble them from strings (`'bg-' + x`). Component variants use signal inputs and a `computed` class mapping with complete class names. The only exception is `appIcon`, which builds `bi bi-<name>`: Bootstrap Icons come from the global stylesheet, not from the scan.
- States follow the ARIA attributes instead of class ternaries: `current:` (custom variant in `src/styles.css` for `aria-current="page"`, set by `routerLinkActive` with `ariaCurrentWhenActive="page"` or `appMenuItem [active]`), `aria-selected:`, `aria-disabled:`.
- Numbers (amounts, prices, percentages) get `tabular-nums`.
- Dark mode is the class `dark` on `<html>`. Because the tokens switch, components rarely need the `dark:` variant.
- **Host styling** goes through the host class (`host: { class: 'block' }`, `host: { '[class]': 'classes()' }`). Don't set `display` or other properties that callers might change with utilities on `:host`: Angular's component styles are unlayered and win over Tailwind's `@layer utilities`, so `<app-panel class="hidden md:block">` would have no effect.
- **Component SCSS** (`.component.scss` / `.page.scss`) exists only for special cases that utilities can't express (`env(safe-area-inset-*)`, `::ng-deep`); `#/lab/tokens` keeps one example of tokens in SCSS. There, tokens are read as `var(--pgo-*)`; never hard-coded hex/rgb values or `rem` spacing. No Tailwind directives (`@apply`, `@reference`, `@theme`) in component styles and no global Sass. Don't override `ViewEncapsulation`.
- Icons come from `bootstrap-icons`, always through `<i appIcon="bell"></i>` (decorative, `aria-hidden`; the surrounding control carries the accessible name, e.g. `appIconButton [label]`), never `<i class="bi bi-…">`. Don't mix in other UI frameworks (Angular Material, Bootstrap utility classes, …).
- Custom class names in SCSS follow BEM (`block__element--modifier`).
- Use `::ng-deep` only to reach into library internals, and scope it under `:host`.

## 5. i18n

The source locale is **German** (`de`).

- Every user-facing text gets an **explicit custom ID**, without meaning or description.
- ID scheme: `@@<layer><Domain>-<componentOrClass>-<key>`.
  - `<layer><Domain>` is the layer and domain the text lives in, in camelCase (`users/feature` → `featureUsers`, `orders/ui` → `uiOrders`).
  - `<componentOrClass>` is the class name in camelCase without the `Component` suffix (`createUserPage`, `orderItems`, `ordersEffects`).
  - `<key>` may have several segments (`createUserForm-name-label`).
  - Examples: `@@featureUsers-createUserPage-submit`, `@@uiOrders-formGeneralInformation-name`, `@@featureOrders-ordersEffects-loadOrdersFailure`.
  - Never reuse an ID for a different text.
- In TypeScript, create class-field labels: ``label = $localize`:@@featureX-xPage-label:Text`;``
- In templates: `<span i18n="@@uiOrders-orderItem-title">Titel</span>`, `<ng-container i18n="@@…">`, and `i18n-<attr>="@@…"` for attributes (e.g. `i18n-label`).
- Every text has an English translation (TS §11.9, E-36); `npm run i18n:check` (strict, in `npm run verify` and the CI gate) fails on a missing, outdated or invalid one. After adding or changing texts:
  1. `npm run translate` (`ng extract-i18n`, then new and changed units go into `src/locale/messages.en.xlf`; a changed German text gets `state="needs-review-translation"`);
  2. write or review the `<target>` of each new or flagged unit in `src/locale/messages.en.xlf` (`state="translated"`), following the term list DE → EN in TS §11.9 and keeping every `<x id>` and ICU case of the source;
  3. `npm run i18n:build` writes `src/assets/i18n/messages.en.json`, `npm run i18n:check` must report 0 findings;
  4. keep `messages.xlf`, `src/locale/messages.en.xlf` and `src/assets/i18n/messages.en.json` in the change.

## 6. State management (NgRx)

State lives in the classic global NgRx Store. Don't introduce `createActionGroup`, `createFeature`, functional effects, ComponentStore, SignalStore or signal-based state services.

**Actions** (`<name>.actions.ts`) are named as events, with a `[<Feature>/Page]` or `[<Feature>/API]` source:

```ts
export const enterOrdersPage = createAction('[Orders/Page] Enter orders page');
export const clickedStartExport = createAction('[Orders/Page] Clicked start export');
export const retrievedOrder = createAction(
  '[Orders/API] Retrieved order',
  props<{ order: Order }>(),
);
export const deleteOrderFailure = createAction(
  '[Orders/API] Delete order failure',
  props<{ error: unknown }>(),
);
```

- Prefixes: `enterX`/`leaveX` for route lifecycle, `clickedX`/`submittedX` for user events, `retrievedX`/`receivedX`/`loadedX` for data arrivals, `xSuccess`/`xFailure` for API results.
- Errors are always `props<{ error: unknown }>()`. State holds `error: unknown`, never `error: any` or an `errorMessage: string`; user feedback goes through toast effects.

**Reducer** (`<name>.reducer.ts`):

```ts
export const ORDERS_FEATURE_KEY = 'orders';

export interface OrdersState {
  loaded: boolean;
  details?: Order;
  error?: unknown;
}

const initialOrdersState: OrdersState = { loaded: false };

const reducer = createReducer(
  initialOrdersState,
  on(OrdersActions.enterOrdersPage, () => initialOrdersState),
  on(OrdersActions.retrievedOrder, (state, { order }) => ({ ...state, details: order })),
);

export function ordersReducer(state: OrdersState | undefined, action: Action): OrdersState {
  return reducer(state, action);
}
```

- Feature keys are camelCase strings. Use `@ngrx/entity` adapters for larger keyed collections.

**Selectors** (`<name>.selectors.ts`):

- `const selectState = createFeatureSelector<XState>(X_FEATURE_KEY);`, then `export const selectX = createSelector(selectState, (state) => state.x);`
- Read route params here via the router-store selectors (`getRouterSelectors()` from `@ngrx/router-store`, e.g. `selectRouteParam('orderId')`), not via `ActivatedRoute` in components.

**Effects** (`<name>.effects.ts`):

- Write an `@Injectable()` class with `readonly #x = inject(...)` fields and `createEffect(() => this.#actions$.pipe(ofType(...), ...))`.
- Read store state with `concatLatestFrom(() => this.#store.pipe(select(...)))` from `@ngrx/operators` (add the package when it's first needed), not `withLatestFrom`.
- Put `catchError((error) => of(xFailure({ error })))` inside the inner `switchMap` pipe, so the effect stream survives.
- Side effects use `{ dispatch: false }` effects that react to actions:
  - toasts and loading indicators via the UI library's services, with `$localize` texts;
  - page title via `Title.setTitle(...)` on `enterXPage`;
  - navigation via `Router`;
  - dialogs.
- Close long-lived streams (WebSocket, polling, timers) with `takeUntil(this.#actions$.pipe(ofType(leaveX)))`.

**Facade** (`<name>.facade.ts`), the only entry point for components:

```ts
@Injectable()
export class OrdersFacade {
  readonly #store = inject(Store);

  order$ = this.#store.pipe(select(OrdersSelectors.selectOrder));

  startExport(): void {
    this.#store.dispatch(OrdersActions.clickedStartExport());
  }
}
```

- Components never inject `Store` directly.

**Providers** (`<name>.providers.ts`):

```ts
export function provideOrdersState(): Array<Provider | EnvironmentProviders> {
  return [
    OrdersFacade,
    provideState(fromOrders.ORDERS_FEATURE_KEY, fromOrders.ordersReducer),
    provideEffects(OrdersEffects),
    provideOrdersService(),
  ];
}
```

- Register route-scoped state in the route: `providers: [provideOrdersState()]`, never `provideState`/`provideEffects` inline in the route definition. App-wide state is registered in the application's bootstrap providers.
- **Exception (engine and game slices, TS §11.2):** `provideEngineService()` is registered exactly once, in `provideAppCore()`, so there is exactly one worker and page tests get the same wiring (they only replace the worker, §10). Slice providers don't include the `EngineService`. The slices of the game area are registered exactly once at the shell route `/game/:playerId` (`provideGameState()`), so effects are not instantiated twice.

**Loading data** is triggered by route guards (`<name>.guards.ts`), not by `ngOnInit`:

```ts
export function enterOrdersPage(): CanActivateFn {
  return () => {
    inject(OrdersFacade).enterOrdersPage();
    return true;
  };
}
// routes: canActivate: [enterOrdersPage()], canDeactivate: [leaveOrdersPage()]
```

- Subscriptions and queries for a page are started by its enter guard and ended by its leave guard. When the required data changes on the page (filters, next page, chart range), effects react to the user's action. The store holds only what the current view needs (one statement page, the candles of the visible chart), never complete journals or histories.
- App-wide state that has to be ready before any route may instead be initialised in its `provideXState()` via `provideAppInitializer(() => inject(XFacade).init())`.

## 7. Data access

**Service:**

```ts
@Injectable()
export class OrdersService {
  readonly #http = inject(HttpClient);
  readonly #config = inject(ORDERS_SERVICE_CONFIG);

  getOrder(orderId: string): Observable<Order> {
    return this.#http.get<Order>(`${this.#config.serviceUrl}/orders/${orderId}`);
  }
}
```

- Services are `@Injectable()` without `providedIn` and are provided through `provide<Name>Service()` in `<name>-service.providers.ts`. The `provideXState()` that uses the service includes it, except for the `EngineService` (§6).
- Methods return typed Observables of domain interfaces. Only map DTOs when the API shape really differs.
- Use `HttpClient`, not `httpResource`/`resource`. Handle errors in effects; local fallbacks like `404 → of([])` are fine in the service.

**Config token** (`<name>-service.config.ts`): an interface `<Name>ServiceConfig` (`serviceUrl: string; useMock?: boolean`) and `export const <NAME>_SERVICE_CONFIG = new InjectionToken<<Name>ServiceConfig>('<NAME>_SERVICE_CONFIG')`.

- Config tokens are provided at bootstrap, from `environment`. **Only bootstrap code imports environment files**; everything else gets its configuration through injection tokens.
- New environment values go in the environment interface/model and in every `environment*.ts`.

**Mock** (`<name>-service.mock.ts`):

- A functional `HttpInterceptorFn` named `<name>ServiceMock`.
- It passes through unless `config.useMock` is set and the URL starts with `config.serviceUrl`.
- It returns `mock-*.data.json` fixtures with an artificial random delay.
- Register it in `withInterceptors([...])` at bootstrap.

**Other rules:**

- Interceptors are functional (`HttpInterceptorFn`), registered with `provideHttpClient(withInterceptors([...]))`, never classes via `HTTP_INTERCEPTORS`.
- Message type guards for WebSocket or other untyped transports go in `<name>-service.utils.ts`.

## 8. Routing and bootstrap

- Each feature has `<domain>.routes.ts` exporting `export const <domain>Routes: Routes`.
- Features are lazy-loaded; pages inside a feature use `loadComponent`:

  ```ts
  {
    path: 'orders',
    loadChildren: async () => {
      return (await import('@app/orders/feature/orders.routes')).ordersRoutes;
    },
  },
  ```

- Guards are functional only: `CanActivateFn`/`CanDeactivateFn` factories, called in the route definition. No class guards and no resolvers. Redirect with `RedirectCommand`.
- App-level wiring (router, store, router store, devtools, config tokens, interceptors, app-wide state) happens in the bootstrap providers. Use `provideAppInitializer(...)`, never `APP_INITIALIZER`.

## 9. Domain models and TypeScript

- Use `interface` for object shapes and `type` for unions, aliases and `Pick`/`Omit` derivations.
- Enum-like values use an `as const` list with a derived type, **not** a TS `enum`:

  ```ts
  export const ORDER_TYPES = ['standard', 'express'] as const;
  export type OrderType = (typeof ORDER_TYPES)[number];
  ```

- Model files are named `*.model.ts`.
- Code compiles under `strict` and `strictTemplates`. Use `unknown` instead of `any`, and don't use non-null assertions to silence real nullability.
- Unused parameters and variables get a `_` prefix. Unused imports are a lint error.
- Imports within a domain are relative (`./`, `../`); imports from another domain, from the app root and from `src/testing` use the alias `@app/<domain>/<layer>/…`, never relative paths into other domains. Cross-domain dependencies are then visible at a glance.
- Imports are sorted by eslint (`import/order`, alphabetical, groups separated by blank lines). Run `ng lint --fix` instead of sorting by hand.
- Formatting is done by Prettier (`.prettierrc`), not by hand. `bracketSameLine` and strict HTML whitespace are intentional, so closing tags like `"></ion-input>` or `>Text</ion-title\n>` are expected.
- Identifiers and comments are in English; only i18n source texts are German.
- Comments are sparse: no JSDoc on obvious members and no section banners. Comment only non-obvious decisions.

## 10. Testing

The test concept is TS §14.1 (principles, test kinds, suites, decision E-29). How to write each kind of test (fixtures, golden master, mocks, page and component tests, replaced boundaries, system and mutation tests) is in `.claude/rules/testing-guide.md`; it loads with the first spec, e2e or `src/testing` file. The rules needed before that:

- **Oracle rule:** an expected value never comes from the code under test or from helpers it uses (formatters, state utils), and configuration values are imported, never copied. Allowed oracles: worked examples from the spec (add the table to TS or PS first if a new rule has none), published reference vectors, independent references (platform functions, a brute-force implementation inside the spec, `ReferenceSimulation`), invariants and metamorphic relations, frozen checksums (`market/domain/golden-master.ts`).
- **Every test must be able to fail for a plausible bug**, tests behaviour at the boundary of a unit (public functions, engine commands, slices, pages) and is deterministic and independent. Facades and guards without logic, reducer branches that only set a value, pure projection selectors, presentational components, directives and pipes are not tested on their own; page tests cover the wiring. There is no coverage target.
- **Which test where:** rules in `domain`/`util` → example tables plus fast-check properties (`logic`); simulation code → determinism contract, golden master and properties (`logic`); statistical targets → `*.calibration.spec.ts`; budgets of TS §14.3 → `*.perf.spec.ts`; engine behaviour → one scenario per acceptance criterion, `US-xx-nn` in the `describe` (`logic`); reducers, selectors, effects, services and guards with logic → slice and service tests (`angular`); pages and ui components with their own behaviour → page and component tests (`angular`); what only a real browser shows → `e2e/<area>.e2e.ts`; rule code → mutation tests.

### Planning tests in an AP

Whoever plans an AP (or a new page or ui component) names its tests right away:

- the example tables (added to the spec if missing), the invariants, one engine scenario per acceptance criterion, the page and component tests and the system test journeys;
- the displayed values that need a `data-testid`;
- the seams the code needs: ports for clock, prices, worker and storage, worker factory tokens with a root default, `PendingTasks` for asynchronous work outside Angular, deterministic seeds and clocks.

## 11. Verify your changes

| Task                           | Command                                                                                                                         |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| Select Node first              | `nvm use` (`.nvmrc` = 22.22.3; the shell default 22.12 is too old for Angular CLI 22)                                           |
| Dev server                     | `npm start` (port 4711); `ng serve --ssl --host 0.0.0.0` for phones (HTTPS-only browser APIs)                                   |
| Everything CI checks           | `npm run verify` (Definition of Done)                                                                                           |
| Fast loop                      | `npm test` (`logic` and `angular`)                                                                                              |
| Logic specs in watch mode      | `npx vitest --project logic`                                                                                                    |
| One spec                       | logic: `npx vitest run src/app/<path>/<name>.spec.ts`; Angular: `ng test --watch=false --include src/app/<path>/<name>.spec.ts` |
| Tests by name                  | `npx vitest run --project logic -t '<regex>'`; `ng test --watch=false --filter '<regex>'`                                       |
| Calibration, budgets, mutation | `npm run test:calibration`, `npm run test:perf`, `npm run test:mutation`                                                        |
| System tests                   | `npm run e2e` (build + Chromium projects); after a build `npm run test:e2e`; all engines `npx playwright test` (CI)             |
| Types of specs and e2e         | `npm run typecheck`; `ng build` type-checks the app                                                                             |
| Lint (and fix)                 | `ng lint --fix`                                                                                                                 |
| Format                         | `npx prettier --write <files>`                                                                                                  |
| Extract i18n                   | `npm run translate` → root `messages.xlf`, merged into `src/locale/messages.en.xlf` and `src/assets/i18n/messages.en.json`      |
| Translations                   | `npm run i18n:check` (missing/outdated/obsolete, strict); `npm run i18n:build` after editing the `.xlf`                         |
