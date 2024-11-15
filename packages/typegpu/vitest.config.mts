import typegpu from 'rollup-plugin-typegpu';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [typegpu({ include: [/.*\.test\.ts/] })],
});
