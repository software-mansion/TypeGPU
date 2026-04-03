import pkg from '../package.json' with { type: 'json' };
import type { TSESLint } from '@typescript-eslint/utils';
import { noMath } from './rules/noMath.ts';

const plugin = {
  meta: {
    name: pkg.name,
    version: pkg.version,
  },
  rules: {
    'no-math': noMath,
  },
} satisfies TSESLint.FlatConfig.Plugin;

export default plugin;
