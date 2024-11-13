import typegpu from 'rollup-plugin-typegpu';
import type { PluginOption } from 'vite';
// eslint-disable-next-line import/extensions
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [typegpu({ include: [/.*\.test\.ts/] }) as PluginOption],
  test: {
    name: 'typegpu',
    environment: 'jsdom',
    exclude: ['./**/node_modules'],
    reporters: 'basic',
    coverage: {
      reporter: ['text', 'json', 'html', 'text-summary'],
      reportsDirectory: './coverage/',
    },
  },
});
