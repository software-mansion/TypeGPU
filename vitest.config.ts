// eslint-disable-next-line import/extensions
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: [
      { find: /^wigsill$/, replacement: './src/index.ts' },
      { find: /^wigsill(.*)$/, replacement: './src/$1.ts' },
    ],
  },
  test: {
    name: 'wigsill',
    environment: 'jsdom',
    dir: 'tests',
    reporters: 'basic',
    coverage: {
      reporter: ['text', 'json', 'html', 'text-summary'],
      reportsDirectory: './coverage/',
    },
  },
});
