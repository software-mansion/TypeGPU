import { defineConfig } from 'tsup';

export default defineConfig({
  entryPoints: [
    'src/index.ts',
    'src/data/index.ts',
    'src/macro/index.ts',
    'src/web/index.ts',
  ],
  outDir: 'dist',
  format: ['cjs', 'esm'],
  tsconfig: './tsconfig.json',
  target: 'es2017',
  splitting: false,
  sourcemap: true,
  clean: true,
  dts: true,
});
