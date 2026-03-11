import { createJiti } from 'jiti';
import type TypeGPUPlugin from 'unplugin-typegpu/vite';
import { defineConfig } from 'vitest/config';

const jiti = createJiti(import.meta.url);
const typegpu = await jiti.import<typeof TypeGPUPlugin>('unplugin-typegpu/vite', { default: true });

export default defineConfig({
  plugins: [typegpu({ forceTgpuAlias: 'tgpu', earlyPruning: false })],
  test: {
    globalSetup: ['setupVitest.ts'],
  },
});
