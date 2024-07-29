import { readFile } from 'node:fs/promises';
import * as path from 'node:path';
import react from '@vitejs/plugin-react-swc';
import { mapValues, values } from 'remeda';
import { type ModuleNode, type PluginOption, defineConfig } from 'vite';

type RawTypesEntry = {
  moduleName: string;
  relativePath: string;
};

function importRawRedirectPlugin(
  moduleMap: Record<string, RawTypesEntry>,
): PluginOption {
  const resolvedMap = mapValues(moduleMap, (entry, virtualModuleId) => {
    const resolvedVirtualModuleId = `\0${virtualModuleId}`;

    const moduleEntryPath = new URL(import.meta.resolve(entry.moduleName))
      .pathname;
    const moduleDistPath = path.dirname(moduleEntryPath);
    const redirectedPath = path.join(moduleDistPath, entry.relativePath);

    return {
      resolvedVirtualModuleId,
      redirectedPath,
    };
  });

  return {
    name: 'import-raw-types',

    /**
     * If there is any change in those type declarations, reload the whole page.
     */
    handleHotUpdate(ctx) {
      if (!ctx.file.includes('/wigsill/dist')) {
        return;
      }

      ctx.server.ws.send({ type: 'full-reload' });
      // Invalidate modules manually
      const invalidatedModules = new Set<ModuleNode>();
      for (const mod of ctx.modules) {
        ctx.server.moduleGraph.invalidateModule(
          mod,
          invalidatedModules,
          ctx.timestamp,
          true,
        );
      }

      return [];
    },

    resolveId(id) {
      const resolved = resolvedMap[id];

      if (resolved) {
        this.addWatchFile(resolved.redirectedPath);
        return resolved.resolvedVirtualModuleId;
      }
    },

    async load(id) {
      const resolved = values(resolvedMap).find(
        (entry) => entry.resolvedVirtualModuleId === id,
      );

      if (!resolved) {
        return;
      }

      this.addWatchFile(resolved.redirectedPath);
      const rawFileContents = await readFile(resolved.redirectedPath, 'utf-8');

      return `
const content = ${JSON.stringify(rawFileContents)
        .replace(/\u2028/g, '\\u2028')
        .replace(/\u2029/g, '\\u2029')};

export default content;
`;
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    importRawRedirectPlugin({
      'wigsill/dist/index.d.ts?raw': {
        moduleName: 'wigsill',
        relativePath: 'index.d.ts',
      },
      'wigsill/dist/data/index.d.ts?raw': {
        moduleName: 'wigsill',
        relativePath: 'data/index.d.ts',
      },
      'wigsill/dist/macro/index.d.ts?raw': {
        moduleName: 'wigsill',
        relativePath: 'macro/index.d.ts',
      },
      'wigsill/dist/web/index.d.ts?raw': {
        moduleName: 'wigsill',
        relativePath: 'web/index.d.ts',
      },
    }),
  ],
});
