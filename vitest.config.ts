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
  resolve: {
    alias: [
      { find: /^wigsill$/, replacement: './packages/wigsill/src/index.ts' },
      { find: /^wigsill(.*)$/, replacement: './packages/wigsill/src/$1.ts' },
    ],
  },
  plugins: [nearleyRedirectPlugin()],
  test: {
    name: 'wigsill',
    environment: 'jsdom',
    exclude: ['./**/node_modules'],
    reporters: 'basic',
    coverage: {
      reporter: ['text', 'json', 'html', 'text-summary'],
      reportsDirectory: './coverage/',
    },
  },
});
