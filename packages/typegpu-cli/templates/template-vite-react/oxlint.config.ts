import { defineConfig } from 'oxlint';
import typegpu from 'eslint-plugin-typegpu';

export default defineConfig({
  plugins: ['typescript', 'import', 'unicorn', 'oxc', 'react'],
  jsPlugins: ['eslint-plugin-typegpu'],
  categories: {
    correctness: 'warn',
    suspicious: 'warn',
  },
  rules: {
    ...typegpu.configs.recommended.rules,
    'typescript/no-non-null-assertion': 'error',
    'typescript/no-explicit-any': 'error',
    'import/no-named-as-default': 'off',
  },
  env: {
    builtin: true,
    browser: true,
  },
});
