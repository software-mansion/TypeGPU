import { defineConfig } from 'vitest/config';
import { typegpuBuiltAliases } from 'typegpu-testing-utility/config';

export default defineConfig({
  resolve: {
    alias: typegpuBuiltAliases(),
  },
  test: {
    projects: ['packages/*', 'apps/*'],
    coverage: {
      reporter: 'html',
      include: ['packages/*/src/**/*.?(c|m)[jt]s?(x)'],
      exclude: ['packages/typegpu-testing-utility/**', '**/*.d.ts'],
    },
  },
});
