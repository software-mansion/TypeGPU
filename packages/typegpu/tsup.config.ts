import { initBuildScript } from '@typegpu/tgpu-dev-cli';
import { defineConfig } from 'tsup';

const { inDevMode } = initBuildScript();

const entry = [
  'src/index.ts',
  'src/data/index.ts',
  'src/std/index.ts',
  'src/common/index.ts',
];

// TODO: Consider stripping `invariant()` calls of their messages for a smaller bundle size.
export default defineConfig({
  entry,
  outDir: 'dist',
  format: ['esm'],
  target: 'es2024',
  splitting: true,
  sourcemap: true,
  minify: !inDevMode,
  clean: true,
  dts: true,
});
