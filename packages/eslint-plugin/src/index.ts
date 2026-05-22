import pkg from '../package.json' with { type: 'json' };
import type { TSESLint } from '@typescript-eslint/utils';
import { allRules, recommendedRules, rules } from './configs.ts';

const pluginBase: TSESLint.FlatConfig.Plugin = {
  meta: {
    name: pkg.name,
    version: pkg.version,
  },
  rules,
};

const recommended = {
  name: 'typegpu/recommended',
  plugins: { typegpu: pluginBase },
  rules: recommendedRules,
} as const satisfies TSESLint.FlatConfig.Config;

const all = {
  name: 'typegpu/all',
  plugins: { typegpu: pluginBase },
  rules: allRules,
} as const satisfies TSESLint.FlatConfig.Config;

const plugin = {
  ...pluginBase,
  configs: {
    recommended,
    all,
  },
} as const satisfies TSESLint.FlatConfig.Plugin;

export default plugin;
