import js from '@eslint/js';
import globals from 'globals';

export default [
  {ignores: ['node_modules/**', 'test-results/**', 'build/**', '.next/**', 'public/game/**']},
  js.configs.recommended,
  {languageOptions: {ecmaVersion: 'latest', sourceType: 'module'}, rules: {'no-unused-vars': ['error', {argsIgnorePattern: '^_'}]}},
  // Presentation, input and service layers run in the browser.
  {files: ['dist/src/**/*.js'], languageOptions: {globals: globals.browser}},
  {files: ['app/**/*.{js,jsx}', 'lib/supabase/**/*.js', 'lib/account/**/*.js', 'proxy.js'], languageOptions: {globals: globals.node}},
  {files: ['components/**/*.{js,jsx}'], languageOptions: {globals: {...globals.node, ...globals.browser}}},
  {files: ['lib/gate-ticket.js'], languageOptions: {globals: {...globals.node, ...globals.browser}}},
  {files: ['app/**/*.jsx', 'components/**/*.jsx'], languageOptions: {parserOptions: {ecmaFeatures: {jsx: true}}}},
  // Pure layers get no browser globals: using `document`, `window`, etc. there is a lint error.
  {files: ['dist/src/domain/**/*.js', 'dist/src/data/**/*.js', 'dist/src/save.js', 'dist/src/config.js'], languageOptions: {globals: {}}},
  {files: ['scripts/**/*.mjs', 'tests/**/*.mjs', '*.js'], languageOptions: {globals: globals.node}},
  {files: ['tests/**/*.browser.mjs', 'scripts/measure-perf.mjs'], languageOptions: {globals: {...globals.node, ...globals.browser}}},
];
