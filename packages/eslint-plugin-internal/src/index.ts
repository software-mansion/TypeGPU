import pkg from '../package.json' with { type: 'json' };
import type { TSESLint } from '@typescript-eslint/utils';
import { noUselessPathSegments } from './rules/noUselessPathSegments.ts';
import { noTgpuDefaultImport } from './rules/noTgpuDefaultImport.ts';
import { noRuntimeTypegpuImport } from './rules/noRuntimeTypegpuImport.ts';

const plugin = {
  meta: {
    name: pkg.name,
    version: pkg.version,
  },
  rules: {
    'no-useless-path-segments': noUselessPathSegments,
    'no-tgpu-default-import': noTgpuDefaultImport,
    'no-runtime-typegpu-import': noRuntimeTypegpuImport,
  },
} satisfies TSESLint.FlatConfig.Plugin;

export default plugin;
