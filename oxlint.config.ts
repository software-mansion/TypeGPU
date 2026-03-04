import { defineConfig } from 'oxlint';
import typegpu from 'eslint-plugin-typegpu';

const typegpuPreset = typegpu.configs?.recommended;
const typegpuRules = typegpuPreset && 'rules' in typegpuPreset ? typegpuPreset.rules : {};

export default defineConfig({
  plugins: ['eslint', 'typescript', 'import', 'unicorn', 'oxc'],
  jsPlugins: ['eslint-plugin-typegpu'],
  categories: {
    correctness: 'warn',
    suspicious: 'warn',
  },
  rules: {
    ...typegpuRules,
    'typescript/no-unsafe-enum-comparison': 'off',
    'typescript/restrict-template-expressions': 'off',
    'typescript/no-unsafe-type-assertion': 'off',
    'typescript/no-explicit-any': 'error',
    'typescript/no-non-null-assertion': 'error',
    'eslint/no-shadow': 'off',
    'eslint-plugin-unicorn/prefer-add-event-listener': 'off',
    'eslint-plugin-import/no-named-as-default': 'off',
    'eslint-plugin-import/no-named-as-default-member': 'off',
    'eslint-plugin-import/extensions': ['error', 'always', { ignorePackages: true }],
  },
  ignorePatterns: ['**/*.astro', '**/*.mjs'],
  overrides: [
    {
      files: ['**/*.test.ts', '**/tests/**'],
      rules: {
        'typescript/unbound-method': 'off',
        'typescript/no-non-null-assertion': 'off',
        'eslint/no-unused-vars': 'off',
        'eslint/no-unused-expressions': 'off',
        'eslint-plugin-unicorn/consistent-function-scoping': 'off',
        'eslint/no-unsafe-optional-chaining': 'off',
        'eslint/no-constant-condition': 'off',
      },
    },
  ],
  env: {
    builtin: true,
  },
});
