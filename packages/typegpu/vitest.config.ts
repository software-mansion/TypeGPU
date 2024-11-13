import typegpu from 'rollup-plugin-typegpu';
import type { PluginOption } from 'vite';
// eslint-disable-next-line import/extensions
import { defineConfig } from 'vitest/config';

function forceTgpuPlugin(): PluginOption {
  return {
    name: 'force-plugin',

    transform(code, id) {
      if (id.endsWith('.test.ts')) {
        return `// import tgpu from 'typegpu';\n${code}`;
      }
    },
  };
}

export default defineConfig({
  plugins: [forceTgpuPlugin(), typegpu() as PluginOption],
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
