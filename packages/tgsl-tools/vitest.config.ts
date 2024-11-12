// eslint-disable-next-line import/extensions
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'tgsl-tools',
    environment: 'jsdom',
    exclude: ['./**/node_modules'],
    reporters: 'basic',
    coverage: {
      reporter: ['text', 'json', 'html', 'text-summary'],
      reportsDirectory: './coverage/',
    },
  },
});
