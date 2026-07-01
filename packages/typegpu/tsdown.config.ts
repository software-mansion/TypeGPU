import { defineConfig } from 'tsdown';

const entry = [
  'src/index.js',
  'src/index.d.ts',
  'src/data/index.ts',
  'src/std/index.ts',
  'src/common/index.ts',
  'src/internal.ts',
];

export default defineConfig({
  entry,
  outDir: 'dist',
  copy: ['./bin.mjs'],
  format: 'esm',
  dts: true,
  platform: 'neutral',
  unbundle: true,
  sourcemap: false,
  target: false,
});
