import { createJiti } from 'jiti';
import type TypeGPUPlugin from 'unplugin-typegpu/vite';
import { defineConfig } from 'vitest/config';
import { typegpuBuiltAliases } from 'typegpu-testing-utility/config';

const jiti = createJiti(import.meta.url);
const typegpu = await jiti.import<typeof TypeGPUPlugin>('unplugin-typegpu/vite', { default: true });

export default defineConfig({
  plugins: [typegpu({ forceTgpuAlias: 'tgpu', earlyPruning: false })],
  resolve: {
    alias: typegpuBuiltAliases(),
  },
  esbuild: {
    jsx: 'automatic',
    jsxImportSource: 'react',
  },
  test: {
    globals: true,
    environment: 'jsdom',
  },
});
