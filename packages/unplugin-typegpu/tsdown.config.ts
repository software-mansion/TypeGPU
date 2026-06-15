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
    'src/rolldown-browser.ts',
    'src/rspack.ts',
    'src/vite.ts',
    'src/webpack.ts',
  ],
  outputOptions: {
    exports: 'named',
  },
  deps: {
    onlyBundle: false,
  },
  outDir: 'dist',
  format: ['cjs', 'esm'],
  tsconfig: './tsconfig.json',
  target: 'es2017',
  platform: 'node',
  sourcemap: false,
  dts: true,
});
