import { createJiti } from 'jiti';
import type TypeGPUPlugin from 'unplugin-typegpu/vite';
import { defineConfig, type Plugin } from 'vitest/config';

const jiti = createJiti(import.meta.url);
const typegpu = await jiti.import<typeof TypeGPUPlugin>(
  'unplugin-typegpu/vite',
  { default: true },
);

export default defineConfig({
  plugins: [
    typegpu({
      forceTgpuAlias: 'tgpu',
      earlyPruning: false,
    }) as unknown as Plugin,
  ],
});
