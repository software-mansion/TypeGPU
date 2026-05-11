import pkg from '../package.json' with { type: 'json' };
import type { TSESLint } from '@typescript-eslint/utils';
import { noUselessPathSegments } from './rules/noUselessPathSegments.ts';

const plugin = {
  meta: {
    name: pkg.name,
    version: pkg.version,
  },
  rules: {
    'no-useless-path-segments': noUselessPathSegments,
  },
} satisfies TSESLint.FlatConfig.Plugin;

export default plugin;
