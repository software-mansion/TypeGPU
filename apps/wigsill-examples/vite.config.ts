import { readFile } from 'node:fs/promises';
import * as path from 'node:path';
import react from '@vitejs/plugin-react-swc';
import { type ModuleNode, type PluginOption, defineConfig } from 'vite';

function wigsillTypesImportPlugin(): PluginOption {
  const wigsillEntryPath = new URL(import.meta.resolve('wigsill')).pathname;
  const wigsillDistPath = path.dirname(wigsillEntryPath);
  const wigsillTypeDeclPath = path.join(wigsillDistPath, 'index.d.ts');

  const virtualModuleId = 'wigsill/dist/index.d.ts?raw';
  const resolvedVirtualModuleId = '\0wigsill-types';

  return {
    name: 'wigsill-types-import',

    /**
     * If there is any change in `wigsill` code, reload the whole page.
     */
    handleHotUpdate(ctx) {
      if (!ctx.file.includes('wigsill/dist/index.d.ts')) {
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
      if (id === virtualModuleId) {
        this.addWatchFile(wigsillTypeDeclPath);
        return resolvedVirtualModuleId;
      }
    },

    async load(id) {
      if (id !== resolvedVirtualModuleId) {
        return;
      }

      this.addWatchFile(wigsillTypeDeclPath);
      const dts = await readFile(wigsillTypeDeclPath, 'utf-8');

      return `
const content = ${JSON.stringify(dts)
        .replace(/\u2028/g, '\\u2028')
        .replace(/\u2029/g, '\\u2029')};

export default content;
`;
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), wigsillTypesImportPlugin()],
});
