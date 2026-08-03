import { defineConfig } from 'vitest/config';
import { typegpuBuiltAliases } from 'typegpu-testing-utility/config';

export default defineConfig({
  resolve: {
    alias: typegpuBuiltAliases(),
  },
  test: {
    projects: ['packages/*', 'apps/*'],
  },
});
