import { registerHooks, type ModuleHooks } from 'node:module';
import { fileURLToPath } from 'node:url';
import remapping from '@jridgewell/remapping';
import type { UnpluginBuildContext, UnpluginContext } from 'unplugin';
import { earlyPruneRegex, type Options } from './core/common.ts';
import { unpluginFactory } from './core/factory.ts';
import { createFilterForId } from './core/filter.ts';

export type { Options } from './core/common.ts';

const sourceMapAnnotationRegex = /^[@#]\s*sourceMappingURL=(\S*?)\s*$/;
const inlineBase64SourceMapRegex =
  /^data:(?:application|text)\/json(?:;charset=[^;,]+)?;base64,(.+)$/i;

/**
 * ECMA-426 11.1.2.1, JavaScriptExtractSourceMapURL without parsing.
 * https://tc39.es/ecma426/#sec-JavaScriptExtractSourceMapURL
 */
export function extractSourceMapURL(source: string): string | undefined {
  const lines = source.split(/\r\n|[\n\r\u2028\u2029]/);
  for (const line of lines.toReversed()) {
    const trimmed = line.trimStart();
    if (trimmed === '') {
      continue;
    }

    if (!trimmed.startsWith('//')) {
      return undefined;
    }

    const comment = trimmed.slice(2);
    if (/["'`]|\*\//.test(comment)) {
      return undefined;
    }
    const match = comment.match(sourceMapAnnotationRegex);
    if (match !== null) {
      return match[1];
    }
  }
  return undefined;
}

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

      let map = transformed.map.toString();
      const inlineMap = extractSourceMapURL(code)?.match(inlineBase64SourceMapRegex);
      if (inlineMap && inlineMap[1]) {
        try {
          // Deno's nextLoad() returns JavaScript already mapped to its TypeScript source.
          map = remapping(
            [map, Buffer.from(inlineMap[1], 'base64').toString('utf8')],
            () => null,
          ).toString();
        } catch {
          transformContext.warn(`Failed to compose the inline source map for ${id}`);
        }
      }

      // Deno requires this data URL without a charset parameter; Node accepts it too.
      const mapURL = `data:application/json;base64,${Buffer.from(map).toString('base64')}`;

      // Inlining the source map, so that stack traces point to the original source
      // (in Node.js, when running with --enable-source-maps)
      return {
        ...result,
        source: `${transformed.code}\n//# sourceMappingURL=${mapURL}`,
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
