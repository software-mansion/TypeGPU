import { mapValues, values } from 'remeda';

/**
 *
 * @param {*} moduleMap
 * @returns {PluginOption}
 */
function importRawRedirectPlugin(
  /**
   * @type Record<string, string>
   */
  moduleMap,
) {
  const resolvedMap = mapValues(moduleMap, (relativePath, virtualModuleId) => {
    const resolvedVirtualModuleId = `\0${virtualModuleId}`;

    return {
      resolvedVirtualModuleId,
      redirectedPath: relativePath,
    };
  });

  return {
    name: 'import-raw-types',

    /**
     * If there is any change in those type declarations, reload the whole page.
     */
    handleHotUpdate(ctx) {
      if (!ctx.file.includes('/typegpu/dist')) {
        return;
      }

      ctx.server.ws.send({ type: 'full-reload' });
      // Invalidate modules manually
      const invalidatedModules = new Set();
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

export default importRawRedirectPlugin;
