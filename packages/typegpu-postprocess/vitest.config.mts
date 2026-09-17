import { fileURLToPath } from 'node:url';
import { createJiti } from 'jiti';
import type TypeGPUPlugin from 'unplugin-typegpu/vite';
import { defineConfig } from 'vitest/config';
import { isTestingBuiltTypegpu, typegpuBuiltAliases } from 'typegpu-testing-utility/config';

const jiti = createJiti(import.meta.url);
const typegpu = await jiti.import<typeof TypeGPUPlugin>('unplugin-typegpu/vite', { default: true });

export default defineConfig({
  plugins: [typegpu({ forceTgpuAlias: 'tgpu', earlyPruning: false })],
  resolve: {
    alias: [
      ...typegpuBuiltAliases(),
      ...(isTestingBuiltTypegpu()
        ? [
            {
              find: /^@typegpu\/postprocess$/,
              replacement: fileURLToPath(new URL('./dist/index.mjs', import.meta.url)),
            },
          ]
        : []),
    ],
  },
  test: { name: 'postprocess' },
});
