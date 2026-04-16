import { createJiti } from 'jiti';
import type TypeGPUPlugin from 'unplugin-typegpu/vite';
import { defineConfig } from 'vitest/config';
import { TEST_BUILT_CODE } from '../../env.ts';

const jiti = createJiti(import.meta.url);
const typegpu = await jiti.import<typeof TypeGPUPlugin>('unplugin-typegpu/vite', { default: true });

const defaultExclude = ['**/node_modules/**', '**/.git/**'];

export default defineConfig({
  plugins: [typegpu({ forceTgpuAlias: 'tgpu', earlyPruning: false })],
  test: {
    globalSetup: ['setupVitest.ts'],
    exclude: TEST_BUILT_CODE ? [...defaultExclude, '**/internal/**'] : defaultExclude,
  },
});
