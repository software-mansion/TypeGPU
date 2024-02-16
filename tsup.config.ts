import { defineConfig } from 'tsup';

export default defineConfig({
  entryPoints: ['src/index.ts'],
  outDir: 'dist',
  format: ['cjs', 'esm'],
  external: ['jotai', '@apollo/client', 'wonka'],
  tsconfig: './tsconfig.json',
  target: 'es2017',
  splitting: false,
  sourcemap: true,
  clean: true,
  dts: true,
});
