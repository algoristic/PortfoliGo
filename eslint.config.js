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
    files: [
      'src/app/{simulation,world,market,clock}/{domain,util}/**/*.ts',
      // The player state must be computed the same everywhere, or a replay diverges (TS §4.4).
      'src/app/engine/domain/**/*.ts',
      // Money and the price grid feed the simulation (rounding of dividends, quotes).
      'src/app/shared/domain/**/*.ts',
    ],
    ignores: ['**/*.spec.ts'],
    rules: {
      'no-restricted-properties': [
        'error',
        ...[
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
          'cbrt',
          'hypot',
        ].map((property) => ({
          object: 'Math',
          property,
          message: 'Not deterministic across engines: use detExp/detLog (TS §4.4) or streams.',
        })),
        { object: 'Date', property: 'now', message: 'Time comes from the tick (TS §4.5).' },
        { object: 'performance', property: 'now', message: 'Time comes from the tick (TS §4.5).' },
      ],
      'no-restricted-globals': [
        'error',
        { name: 'crypto', message: 'Randomness comes from streams (TS §4.5).' },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: 'BinaryExpression[operator="**"]',
          message: 'Not deterministic across engines: use multiplication or detExp/detLog.',
        },
        {
          selector: 'NewExpression[callee.name="Date"]',
          message: 'Time comes from the tick (TS §4.5).',
        },
      ],
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
