import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/index.ts'],
  outDir: 'dist',
  inlineOnly: false,
  format: 'esm',
  dts: true,
  platform: 'neutral',
  target: false,
  unbundle: true,
  sourcemap: false,
});
