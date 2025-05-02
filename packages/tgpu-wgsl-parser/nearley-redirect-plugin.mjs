import * as path from 'node:path';

/**
 * Redirects all imports of files that end in '.ne'
 * into imports of their corresponding '.ts' files.
 */
export default function nearleyRedirectPlugin() {
  return {
    name: 'nearley-redirect',
    enforce: /** @type {const} */ ('pre'),

    /**
     * @param {string} source
     * @param {string=} importer
     * @returns {{ id: string } | undefined}
     */
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
