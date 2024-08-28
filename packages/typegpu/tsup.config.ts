import { defineConfig } from 'tsup';

export default defineConfig({
  entryPoints: ['src/index.ts', 'src/data/index.ts', 'src/future/index.ts'],
  outDir: 'dist',
  format: ['cjs', 'esm'],
  tsconfig: './tsconfig.json',
  target: 'es2017',
  splitting: true,
  sourcemap: true,
  minify: true,
  clean: true,
  dts: true,
});
