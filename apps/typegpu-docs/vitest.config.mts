import { createJiti } from 'jiti';
import type TypeGPUPlugin from 'unplugin-typegpu/vite';
import { imagetools } from 'vite-imagetools';
import { defineConfig, type Plugin } from 'vitest/config';

const jiti = createJiti(import.meta.url);
const typegpu = await jiti.import<typeof TypeGPUPlugin>('unplugin-typegpu/vite', { default: true });

export default defineConfig({
  plugins: [typegpu({ include: [/\.m?[jt]sx?/] }), imagetools()] as Plugin[],
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
    include: ['**/*.{test,spec}.browser.ts'],
    browser: {
      provider: 'preview',
      instances: [{ browser: 'chromium' }],
    },
  },
});
