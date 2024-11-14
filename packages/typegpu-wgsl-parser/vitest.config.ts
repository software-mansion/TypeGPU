import * as path from 'node:path';
import type { PluginOption } from 'vite';
// eslint-disable-next-line import/extensions
import { defineConfig } from 'vitest/config';

/**
 * Redirects all imports of files that end in '.ne'
 * into imports of their corresponding '.ts' files.
 */
function nearleyRedirectPlugin(): PluginOption {
  return {
    name: 'nearley-redirect',
    enforce: 'pre',

    resolveId(source, importer) {
      if (source.endsWith('.ne')) {
        const abs = importer
          ? path.join(path.dirname(importer), source)
          : source;

        return {
          id: abs.replace(/\.ne$/, '.ts'),
        };
      }
    },
  };
}

export default defineConfig({
  plugins: [nearleyRedirectPlugin()],
  test: {
    name: 'typegpu-wgsl-parser',
  },
});
