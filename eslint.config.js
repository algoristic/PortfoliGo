// @ts-check
const tseslint = require('typescript-eslint');
const angular = require('angular-eslint');
const eslintPluginUnusedImports = require('eslint-plugin-unused-imports');
const eslintPluginImport = require('eslint-plugin-import');

/** `no-restricted-imports` pattern for the layers a layer must not import (CLAUDE.md §1). */
function forbiddenLayers(layer, layers) {
  return {
    regex: `(^|/)(${layers.join('|')})/`,
    message: `The ${layer} layer must not depend on ${layers.join(', ')} (CLAUDE.md §1).`,
  };
}

const FRAMEWORK_IMPORTS = {
  regex: '^(@angular|@ngrx|rxjs)(/|$)',
  message: 'domain and util are framework-free, so they run in the worker (CLAUDE.md §1).',
};

/** `Math` functions that ECMAScript leaves implementation-approximated (TS §4.4). */
const INEXACT_MATH = [
  'random',
  'exp',
  'expm1',
  'log',
  'log1p',
  'log2',
  'log10',
  'pow',
  'sin',
  'cos',
  'tan',
  'asin',
  'acos',
  'atan',
  'atan2',
  'sinh',
  'cosh',
  'tanh',
  'asinh',
  'acosh',
  'atanh',
  'cbrt',
  'hypot',
];

const LOCALE_MESSAGE =
  'Depends on the ICU data of the engine: compare code units, or disable with a reason (TS §4.5).';

/**
 * Code under the determinism rules (TS §4.4): simulation, the player state and every other folder
 * the engine worker bundles, so that the worker computes the same everywhere. The lab statistics
 * (`lab/domain`) stay outside: they never feed back into the simulation.
 */
const DETERMINISTIC_FILES = [
  'src/app/{simulation,world,market,clock}/{domain,util}/**/*.ts',
  // The player state must be computed the same everywhere, or a replay diverges (TS §4.4).
  'src/app/engine/domain/**/*.ts',
  'src/app/{banking,trading,portfolio,taxes,dashboard}/domain/**/*.ts',
  // Money and the price grid feed the simulation (rounding of dividends, quotes).
  'src/app/shared/domain/**/*.ts',
  // Further folders the engine worker bundles (AP 7.3a).
  'src/app/{analysis,notifications,players}/domain/**/*.ts',
  'src/app/persistence/util/**/*.ts',
  'src/app/engine/data-access/worker/**/*.ts',
];

/** Syntax that bypasses `no-restricted-properties` and `no-restricted-globals` (TS §4.4, §4.5). */
const DETERMINISM_SYNTAX = [
  {
    selector: 'BinaryExpression[operator="**"]',
    message: 'Not deterministic across engines: use multiplication or detExp/detLog.',
  },
  {
    selector: 'AssignmentExpression[operator="**="]',
    message: 'Not deterministic across engines: use multiplication or detExp/detLog.',
  },
  {
    selector: 'NewExpression[callee.name="Date"]',
    message: 'Time comes from the tick (TS §4.5).',
  },
  {
    selector: 'CallExpression[callee.name="Date"]',
    message: 'Time comes from the tick (TS §4.5).',
  },
  {
    // `const m = Math`, `f(Math)`: an alias escapes the property rules.
    selector: 'Identifier[name="Math"]:not(MemberExpression[computed=false] > Identifier.object)',
    message: 'Use Math only as `Math.<name>`, so the determinism rules see the call (TS §4.4).',
  },
  {
    // `Math[name]` with a computed key escapes the property rules as well.
    selector: 'MemberExpression[computed=true][object.name="Math"]',
    message: 'Use Math only as `Math.<name>`, so the determinism rules see the call (TS §4.4).',
  },
  {
    // `globalThis.Math`, `self.crypto`, `self.performance.now()`, `globalThis.Date`.
    selector:
      'MemberExpression[object.name=/^(globalThis|self|window)$/][property.name=/^(Math|Date|crypto|performance|Intl)$/]',
    message: 'Reach globals directly, so the determinism rules see them (TS §4.4, §4.5).',
  },
  {
    selector: 'MemberExpression[property.name=/^(localeCompare|toLocale\\w*)$/]',
    message: LOCALE_MESSAGE,
  },
];

module.exports = tseslint.config(
  {
    plugins: {
      'unused-imports': eslintPluginUnusedImports,
      import: eslintPluginImport,
    },
    settings: {
      // `@app/*` is the path alias of `src/app` (tsconfig.json), not a package.
      'import/internal-regex': '^@app/',
    },
  },
  {
    files: ['**/*.ts'],
    ignores: ['projects/**/*'],
    extends: [...angular.configs.tsRecommended],
    processor: angular.processInlineTemplates,
    rules: {
      '@angular-eslint/component-class-suffix': ['error', { suffixes: ['Page', 'Component'] }],
      '@angular-eslint/component-selector': [
        'error',
        { type: 'element', prefix: 'app', style: 'kebab-case' },
      ],
      '@angular-eslint/directive-selector': [
        'error',
        { type: 'attribute', prefix: 'app', style: 'camelCase' },
      ],
      'unused-imports/no-unused-imports': 'error',
      'unused-imports/no-unused-vars': [
        'error',
        {
          vars: 'all',
          varsIgnorePattern: '^_',
          args: 'after-used',
          argsIgnorePattern: '^_',
        },
      ],
      'sort-imports': [
        'error',
        {
          ignoreCase: true,
          ignoreDeclarationSort: true,
        },
      ],
      'import/order': [
        'error',
        {
          groups: ['external', 'builtin', 'internal', 'sibling', 'parent', 'index'],
          alphabetize: {
            order: 'asc',
            caseInsensitive: true,
          },
          'newlines-between': 'always-and-inside-groups',
        },
      ],
    },
  },
  // Layer rules (CLAUDE.md §1); they match the import path, so aliases and relative paths both count.
  {
    files: ['src/app/*/ui/**/*.ts'],
    ignores: ['**/*.spec.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: [forbiddenLayers('ui', ['feature', 'data-access'])] },
      ],
    },
  },
  {
    files: ['src/app/*/data-access/**/*.ts'],
    ignores: ['**/*.spec.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: [forbiddenLayers('data-access', ['feature', 'ui'])] },
      ],
    },
  },
  {
    files: ['src/app/*/domain/**/*.ts'],
    ignores: ['**/*.spec.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            forbiddenLayers('domain', ['feature', 'ui', 'data-access']),
            FRAMEWORK_IMPORTS,
          ],
        },
      ],
    },
  },
  {
    files: ['src/app/*/util/**/*.ts'],
    ignores: ['**/*.spec.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            forbiddenLayers('util', ['feature', 'ui', 'data-access', 'domain']),
            FRAMEWORK_IMPORTS,
          ],
        },
      ],
    },
  },
  {
    // Determinism rules for simulation code (TS §4.4, §4.5); the UI may use Math.* freely.
    files: DETERMINISTIC_FILES,
    ignores: ['**/*.spec.ts'],
    rules: {
      'no-restricted-properties': [
        'error',
        ...INEXACT_MATH.map((property) => ({
          object: 'Math',
          property,
          message: 'Not deterministic across engines: use detExp/detLog (TS §4.4) or streams.',
        })),
        { object: 'Date', property: 'now', message: 'Time comes from the tick (TS §4.5).' },
        { object: 'Date', property: 'parse', message: 'Time comes from the tick (TS §4.5).' },
        { object: 'performance', property: 'now', message: 'Time comes from the tick (TS §4.5).' },
      ],
      'no-restricted-globals': [
        'error',
        { name: 'crypto', message: 'Randomness comes from streams (TS §4.5).' },
        { name: 'Intl', message: LOCALE_MESSAGE },
      ],
      'no-restricted-syntax': ['error', ...DETERMINISM_SYNTAX],
    },
  },
  {
    // Tests are deterministic and never focused (TS §14.1). Time is measured only in the perf
    // suite, which has its own block below.
    files: ['**/*.spec.ts'],
    ignores: ['**/*.perf.spec.ts'],
    rules: {
      'no-restricted-properties': [
        'error',
        { object: 'Math', property: 'random', message: 'Tests use fixed seeds (TS §14.1).' },
        {
          object: 'Date',
          property: 'now',
          message: 'No wall clock in tests; budgets belong in *.perf.spec.ts (TS §14.3).',
        },
        {
          object: 'performance',
          property: 'now',
          message: 'No wall clock in tests; budgets belong in *.perf.spec.ts (TS §14.3).',
        },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: 'MemberExpression[property.name="only"]',
          message: 'Focused tests must not be committed (TS §14.1).',
        },
      ],
    },
  },
  {
    files: ['**/*.perf.spec.ts', 'e2e/**/*.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: 'MemberExpression[property.name="only"]',
          message: 'Focused tests must not be committed (TS §14.1).',
        },
      ],
    },
  },
  {
    // Specs of framework-free code run in plain Vitest under Node (TS §14.1).
    files: ['src/app/*/domain/**/*.spec.ts', 'src/app/*/util/**/*.spec.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            FRAMEWORK_IMPORTS,
            {
              regex: '(^|/)testing/(page|dom|chart-platform|viewport)$',
              message: 'DOM helpers need jsdom; domain and util specs run under Node (TS §14.1).',
            },
          ],
        },
      ],
    },
  },
  {
    // Oracle rule: a page test must not compute its expectations with the formatting or state
    // helpers of the page under test (TS §14.1).
    files: ['src/app/**/*.page.spec.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex: '(^|/)(shared/util/format|clock/domain/game-time-format)$',
              message: 'Assert literal texts; formatting is tested in its own spec (TS §14.1).',
            },
            {
              regex: '/state/[^/]+\\.utils$',
              message: 'Derive expectations independently of the state helpers (TS §14.1).',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['**/*.html'],
    extends: [...angular.configs.templateRecommended, ...angular.configs.templateAccessibility],
    rules: {},
  },
);
