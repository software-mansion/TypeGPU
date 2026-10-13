import { comptime } from 'comptime/vite';
import { createJiti } from 'jiti';
import type TypeGPUPlugin from 'unplugin-typegpu/vite';
import { imagetools } from 'vite-imagetools';
import { defineConfig, type Plugin } from 'vitest/config';
import { preview } from '@vitest/browser-preview';
import { typegpuBuiltAliases } from 'typegpu-testing-utility/config';

const jiti = createJiti(import.meta.url);
const typegpu = await jiti.import<typeof TypeGPUPlugin>('unplugin-typegpu/vite', { default: true });

/**
 * Config of the browser benchmark, used by `pnpm test:browser` (`vitest --config <this file>`).
 * It is deliberately not part of the root `projects`: the browser-only tests can't be collected
 * outside of Browser Mode, so unfiltered runs (e.g. `pnpm test:coverage`) would fail on them. It
 * also can't live in `vitest.config.mts` next to the unit project, because `test.projects` nested
 * there is not discovered when this app is loaded as a project by the root config.
 */
export default defineConfig({
  plugins: [
    typegpu({ include: [/\.m?[jt]sx?/] }),
    imagetools(),
    // Examples use `comptime()` (see `src/examples/usedApis.ts`), same setup as in `astro.config.mjs`
    { ...comptime({ timeout: 60_000 }), enforce: 'post' },
  ] as Plugin[],
  resolve: {
    alias: typegpuBuiltAliases(),
  },
  server: {
    proxy: {
      '/TypeGPU': {
        // Usually where the TypeGPU dev server is
        // hosted.
        target: 'http://localhost:4321',
        changeOrigin: true,
      },
    },
  },
  test: {
    name: 'browser',
    root: import.meta.dirname,
    include: ['**/*.{test,spec}.browser.ts'],
    browser: {
      provider: preview(),
      instances: [{ browser: 'chromium' }],
    },
  },
});
