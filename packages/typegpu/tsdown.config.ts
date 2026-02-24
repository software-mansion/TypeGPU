import { defineConfig } from 'tsdown';

const entry = [
  'src/index.js',
  'src/index.d.ts',
  'src/data/index.ts',
  'src/std/index.ts',
  'src/common/index.ts',
];

export default defineConfig({
  entry,
  outDir: 'dist',
  format: 'esm',
  dts: true,
  platform: 'neutral',
  target: false,
});
