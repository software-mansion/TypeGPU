import { createJiti } from 'jiti';
import type TypeGPUPlugin from 'unplugin-typegpu/rollup';
import { defineConfig } from 'vitest/config';

const jiti = createJiti(import.meta.url);
const typegpu = await jiti.import<typeof TypeGPUPlugin>(
  'unplugin-typegpu/rollup',
  { default: true },
);

export default defineConfig({
  plugins: [typegpu({ include: [/.*\.test\.ts/], forceTgpuAlias: 'tgpu' })],
  test: {
    globalSetup: ['setupVitest.ts'],
  },
});
