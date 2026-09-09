import { registerHooks, type ModuleHooks } from 'node:module';
import { fileURLToPath } from 'node:url';
import type { UnpluginBuildContext, UnpluginContext } from 'unplugin';
import { earlyPruneRegex, type Options } from './core/common.ts';
import { unpluginFactory } from './core/factory.ts';
import { createFilterForId } from './core/filter.ts';

export type { Options } from './core/common.ts';

/**
 * Installs TypeGPU's synchronous module hooks in Node.js 22.15+ and Deno 2.8+.
 * Use a dynamic import after calling this function, or call it from a preloaded
 * module (`node --import ./preload.mjs main.ts` or
 * `deno run --import ./preload.mjs main.ts`).
 */
export default function install(rawOptions?: Options): ModuleHooks {
  const plugin = unpluginFactory(
    { include: /\.[cm]?[jt]sx?$/, ...rawOptions },
    { framework: 'unloader' },
  );
  const filter = createFilterForId(plugin.transform.filter.id);
  const transformContext = {
    warn: (message: string) => console.warn(`[unplugin-typegpu] ${message}`),
  } as UnpluginBuildContext & UnpluginContext;

  return registerHooks({
    load(url, context, nextLoad) {
      const result = nextLoad(url, context);
      if (result.source == null || result.format === 'json' || result.format === 'wasm') {
        return result;
      }

      const id = urlToId(url);
      if (filter && !filter(id)) {
        return result;
      }

      const code =
        typeof result.source === 'string' ? result.source : new TextDecoder().decode(result.source);
      if (rawOptions?.earlyPruning !== false && earlyPruneRegex.every((p) => !p.test(code))) {
        return result;
      }

      const transformed = plugin.transform.handler.call(transformContext, code, id);
      if (!transformed) {
        return result;
      }
      // Inlining the source map, so that stack traces point to the original source
      // (in Node.js, when running with --enable-source-maps)
      return {
        ...result,
        source: `${transformed.code}\n//# sourceMappingURL=${transformed.map.toUrl()}`,
      };
    },
  });
}

/**
 * File URLs become file paths, while other URLs (e.g. remote modules) keep their
 * origin and get their path decoded, so that include/exclude globs match them the same way.
 */
function urlToId(url: string): string {
  const moduleURL = new URL(url);
  if (moduleURL.protocol === 'file:') {
    return fileURLToPath(moduleURL);
  }
  moduleURL.search = '';
  moduleURL.hash = '';
  try {
    return decodeURI(moduleURL.href);
  } catch {
    return moduleURL.href;
  }
}
