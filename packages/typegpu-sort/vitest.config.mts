import typegpu from 'unplugin-typegpu/vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [typegpu({ forceTgpuAlias: 'tgpu', earlyPruning: false })],
});
