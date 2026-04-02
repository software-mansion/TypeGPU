import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/index.ts'],
  outDir: 'dist',
  deps: {
    onlyBundle: false,
  },
  format: ['cjs', 'esm'],
  dts: true,
  platform: 'neutral',
  target: false,
  unbundle: true,
  sourcemap: false,
});
