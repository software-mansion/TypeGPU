import fs from 'node:fs';
import { integerDivision } from './rules/integerDivision.ts';
import type { TSESLint } from '@typescript-eslint/utils';
import { recommendedRules } from './configs.ts';

const pkg = JSON.parse(
  fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
);

const rules = {
  'integer-division': integerDivision,
} as const;

export type RawRules = typeof rules;

const pluginBase: TSESLint.FlatConfig.Plugin = {
  meta: {
    name: pkg.name,
    version: pkg.version,
  },
  rules,
};

const recommended: TSESLint.FlatConfig.Config = {
  name: 'typegpu/recommended',
  plugins: { typegpu: pluginBase },
  rules: recommendedRules,
};

export const plugin: TSESLint.FlatConfig.Plugin = {
  ...pluginBase,
  configs: {
    recommended,
  },
};

// const allRules = Object.fromEntries(
//   Object.keys(rules).map((name) => [`typegpu/${name}`, 'error']),
// );
