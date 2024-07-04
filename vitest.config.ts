// eslint-disable-next-line import/extensions
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: [
      { find: /^wigsill$/, replacement: './packages/wigsill/src/index.ts' },
      { find: /^wigsill(.*)$/, replacement: './packages/wigsill/src/$1.ts' },
    ],
  },
  test: {
    name: 'wigsill',
    environment: 'jsdom',
    exclude: ['./**/node_modules'],
    reporters: 'basic',
    coverage: {
      reporter: ['text', 'json', 'html', 'text-summary'],
      reportsDirectory: './coverage/',
    },
  },
});
