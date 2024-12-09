import * as path from 'node:path';
import { defineConfig } from 'vitest/config';

/**
 * Redirects all imports of files that end in '.ne'
 * into imports of their corresponding '.ts' files.
 */
function nearleyRedirectPlugin() {
  return {
    name: 'nearley-redirect',
    enforce: 'pre' as const,

    resolveId(source: string, importer: string | undefined) {
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
});
