import { createJiti } from 'jiti';
import type TypeGPUPlugin from 'unplugin-typegpu/vite';
import { defineConfig } from 'vitest/config';
import { typegpuBuiltAliases } from 'typegpu-testing-utility/config';

const jiti = createJiti(import.meta.url);
const typegpu = await jiti.import<typeof TypeGPUPlugin>('unplugin-typegpu/vite', { default: true });

// Standalone config for tests that need a real WebGPU device (see `typegpu-testing-utility/gpu`).
// Not part of the root `projects`, so `pnpm test:unit` never picks these files up.
export default defineConfig({
  plugins: [typegpu({ forceTgpuAlias: 'tgpu', earlyPruning: false })],
  resolve: {
    alias: typegpuBuiltAliases(),
  },
  test: {
    include: ['tests/**/*.gpu.ts'],
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
