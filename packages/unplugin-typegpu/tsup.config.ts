import { initBuildScript } from '@typegpu/tgpu-dev-cli';
import { defineConfig } from 'tsup';

const { inDevMode } = initBuildScript();

export default defineConfig({
  entry: [
    'src/index.ts',
    'src/rollup.ts',
    'src/babel.ts',
    'src/esbuild.ts',
    'src/farm.ts',
    'src/rolldown.ts',
    'src/rspack.ts',
    'src/vite.ts',
    'src/webpack.ts',
  ],
  outDir: 'dist',
  format: ['cjs', 'esm'],
  tsconfig: './tsconfig.json',
  target: 'es2017',
  splitting: true,
  sourcemap: true,
  minify: !inDevMode,
  clean: !inDevMode,
  dts: true,
});
