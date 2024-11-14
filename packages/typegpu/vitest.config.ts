import typegpu from 'rollup-plugin-typegpu';
import type { PluginOption } from 'vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [typegpu({ include: [/.*\.test\.ts/] }) as PluginOption],
  test: {
    name: 'typegpu',
  },
});
