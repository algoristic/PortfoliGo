// @ts-check
const tseslint = require('typescript-eslint');
const angular = require('angular-eslint');
const eslintPluginUnusedImports = require('eslint-plugin-unused-imports');
const eslintPluginImport = require('eslint-plugin-import');

module.exports = tseslint.config(
  {
    plugins: {
      'unused-imports': eslintPluginUnusedImports,
      import: eslintPluginImport,
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
  {
    // Determinism rules for simulation code (TS §4.4, §4.5); the UI may use Math.* freely.
    files: ['src/app/{simulation,world,market,clock}/{domain,util}/**/*.ts'],
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
    files: ['**/*.html'],
    extends: [...angular.configs.templateRecommended],
    rules: {},
  },
);
