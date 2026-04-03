import pkg from '../package.json' with { type: 'json' };
import type { TSESLint } from '@typescript-eslint/utils';
import { noUselessPathSegments } from './rules/noUselessPathSegments.ts';
import { noLongImports } from './rules/noLongImports.ts';

const plugin = {
  meta: {
    name: pkg.name,
    version: pkg.version,
  },
  rules: {
    'no-useless-path-segments': noUselessPathSegments,
    'no-long-imports': noLongImports,
  },
} satisfies TSESLint.FlatConfig.Plugin;

export default plugin;
