import { defineConfig } from 'tsup';

const EXPERIMENTAL = process.env.EXPERIMENTAL === 'true';

console.log(`-= ${EXPERIMENTAL ? 'EXPERIMENTAL' : 'PRODUCTION'} MODE =-\n\n`);

const entry = ['src/index.ts', 'src/data/index.ts'];
if (EXPERIMENTAL) {
  entry.push('src/experimental/index.ts', 'src/macro/index.ts');
}

export default defineConfig({
  entry,
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
