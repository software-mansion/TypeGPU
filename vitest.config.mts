import { defineConfig } from 'vitest/config';

export default defineConfig({
  assetsInclude: ['**/*.npy'],
  test: {
    projects: ['packages/*', 'apps/*'],
  },
});
