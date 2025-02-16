import { createJiti } from 'jiti';
import type TypeGPUPlugin from 'rollup-plugin-typegpu';
import nearleyRedirectPlugin from 'tgpu-wgsl-parser/nearley-redirect-plugin';
import { defineConfig } from 'vitest/config';

const jiti = createJiti(import.meta.url);
const typegpu = await jiti.import<typeof TypeGPUPlugin>(
  'rollup-plugin-typegpu',
  { default: true },
);

export default defineConfig({
  plugins: [typegpu({ include: [/.*\.test\.ts/] }), nearleyRedirectPlugin()],
});
