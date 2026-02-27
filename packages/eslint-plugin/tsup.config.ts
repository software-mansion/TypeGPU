import { defineConfig, type Options } from 'tsup';

const config: Options = {
  entry: ['src/index.ts'],
  format: ['cjs', 'esm'],
  dts: true,
  clean: true,
  splitting: true,
  sourcemap: true,
};

export default defineConfig(config);
