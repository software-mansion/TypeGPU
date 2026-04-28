import { defineConfig } from 'tsdown';
import typegpu from 'unplugin-typegpu/rolldown';

export default defineConfig({
  entry: ['src/index.ts'],
  outDir: 'dist',
  format: ['cjs', 'esm'],
  dts: true,
  platform: 'neutral',
  unbundle: true,
  sourcemap: false,
  target: false,
  plugins: [typegpu({ include: [/\.ts$/], exclude: [/\.d\.ts$/] })],
});
