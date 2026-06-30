import { createJiti } from 'jiti';
import type TypeGPUPlugin from 'unplugin-typegpu/vite';
import { configDefaults, defineConfig } from 'vitest/config';

const jiti = createJiti(import.meta.url);
const typegpu = await jiti.import<typeof TypeGPUPlugin>('unplugin-typegpu/vite', { default: true });
const testBuilt = process.env.TEST_BUILT === '1' || process.env.TEST_BUILT === 'true';

export default defineConfig({
  plugins: [typegpu({ forceTgpuAlias: 'tgpu', earlyPruning: false })],
  test: {
    exclude: testBuilt
      ? [...configDefaults.exclude, 'tests/internal/**/*.{test,spec}.?(c|m)[jt]s?(x)']
      : configDefaults.exclude,
    globalSetup: ['setupVitest.ts'],
  },
});
