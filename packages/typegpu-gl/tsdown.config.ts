import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/index.ts'],
  outDir: 'dist',
  format: 'esm',
  dts: true,
  platform: 'neutral',
  unbundle: true,
  sourcemap: false,
  target: false,
});
