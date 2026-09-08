import { createJiti } from 'jiti';
import type TypeGPUPlugin from 'unplugin-typegpu/vite';
import { imagetools } from 'vite-imagetools';
import { defineConfig, type Plugin } from 'vitest/config';
import { typegpuBuiltAliases } from 'typegpu-testing-utility/config';

const jiti = createJiti(import.meta.url);
const typegpu = await jiti.import<typeof TypeGPUPlugin>('unplugin-typegpu/vite', { default: true });

export default defineConfig({
  plugins: [typegpu({ include: [/\.m?[jt]sx?/] }), imagetools()] as Plugin[],
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
    projects: [
      {
        extends: true,
        test: {
          name: 'explorer',
          include: ['src/components/explorer/*.test.ts'],
          environment: 'node',
        },
      },
      {
        test: {
          name: 'individual-example-tests',
          root: './tests/individual-example-tests',
          environment: 'node',
        },
      },
    ],
  },
});
