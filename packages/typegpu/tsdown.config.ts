import { defineConfig } from 'tsdown';

const entry = [
  'src/index.ts',
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
