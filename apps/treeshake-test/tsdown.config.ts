import { defineConfig } from 'tsdown';

export default defineConfig({
  format: 'esm',
  clean: false,
  minify: true,
  treeshake: true,
  platform: 'neutral',
  external: [],
  noExternal: ['typegpu'],
});
