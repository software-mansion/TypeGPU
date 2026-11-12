import { createUnplugin, type UnpluginOptions } from 'unplugin';
import typegpu from 'unplugin-typegpu';

type TransformHandler = Extract<
  NonNullable<UnpluginOptions['transform']>,
  { handler: unknown }
>['handler'];

/**
 * Transform results of `unplugin-typegpu`, keyed by module id.
 * Every test bundles (mostly) the same `typegpu` files, and transforming them
 * with Babel over and over again dominates the bundling time. The cache lives
 * as long as the worker thread (see `bundleWorker.ts`).
 */
const transformCache = new Map<string, { code: string; result: ReturnType<TransformHandler> }>();

/**
 * `unplugin-typegpu`, with transform results cached across builds.
 * The transform only depends on the module's code and id, so the output
 * is the same as with the plain plugin.
 */
export const cachedTypegpuPlugin = createUnplugin<Parameters<typeof typegpu.raw>[0]>(
  (options, meta) => {
    const plugin = typegpu.raw(options, meta);
    if (Array.isArray(plugin)) {
      throw new Error(`Expected unplugin-typegpu to be a single plugin`);
    }
    const transform = plugin.transform;
    if (!transform || typeof transform === 'function') {
      throw new Error(
        `Expected unplugin-typegpu's transform to be an object with a filter and a handler`,
      );
    }
    const handler: TransformHandler = transform.handler;

    return {
      ...plugin,
      transform: {
        ...transform,
        handler(code, id) {
          const cached = transformCache.get(id);
          if (cached?.code === code) {
            return cached.result;
          }
          const result = handler.call(this, code, id);
          transformCache.set(id, { code, result });
          return result;
        },
      },
    };
  },
);
