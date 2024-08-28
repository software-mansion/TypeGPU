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
      {
        find: /^typegpu\/data$/,
        replacement: './packages/typegpu/src/data/index.ts',
      },
      {
        find: /^typegpu\/macro$/,
        replacement: './packages/typegpu/src/macro/index.ts',
      },
      {
        find: /^typegpu\/future$/,
        replacement: './packages/typegpu/src/future/index.ts',
      },
      { find: /^typegpu$/, replacement: './packages/typegpu/src/index.ts' },
      { find: /^typegpu(.*)$/, replacement: './packages/typegpu/src/$1.ts' },
    ],
  },
  plugins: [nearleyRedirectPlugin()],
  test: {
    name: 'typegpu',
    environment: 'jsdom',
    exclude: ['./**/node_modules'],
    reporters: 'basic',
    coverage: {
      reporter: ['text', 'json', 'html', 'text-summary'],
      reportsDirectory: './coverage/',
    },
  },
});
