import fs from 'node:fs';
import type { TSESLint } from '@typescript-eslint/utils';
import { allRules, recommendedRules, rules } from './configs.ts';

const pkg = JSON.parse(
  fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
);

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

const all: TSESLint.FlatConfig.Config = {
  name: 'typegpu/all',
  plugins: { typegpu: pluginBase },
  rules: allRules,
};

export const plugin: TSESLint.FlatConfig.Plugin = {
  ...pluginBase,
  configs: {
    recommended,
    all,
  },
};
