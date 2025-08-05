import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: [
    'src/index.ts',
    'src/rollup.ts',
    'src/babel.ts',
    'src/bun.ts',
    'src/esbuild.ts',
    'src/farm.ts',
    'src/rolldown.ts',
    'src/rspack.ts',
    'src/vite.ts',
    'src/webpack.ts',
  ],
});
