import { defineConfig } from 'tsup';

const DEV = process.env.DEV === 'true';

console.log(`-= ${DEV ? 'DEV' : 'PRODUCTION'} MODE =-\n\n`);

const entry = ['src/index.ts', 'src/data/index.ts', 'src/macro/index.ts'];
if (DEV) {
  entry.push('src/experimental/index.ts');
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
