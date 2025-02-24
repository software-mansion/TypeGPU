import { defineConfig } from 'vitest/config';
import nearleyRedirectPlugin from './nearley-redirect-plugin.mjs';

export default defineConfig({
  plugins: [nearleyRedirectPlugin()],
});
