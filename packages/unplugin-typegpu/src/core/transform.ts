import type { UnpluginBuildContext, UnpluginContext } from 'unplugin';
import { earlyPruneRegex, type Options } from './common.ts';
import { unpluginFactory } from './factory.ts';
import { createFilterForId } from './filter.ts';

export interface TypegpuTransformResult {
  code: string;
  map: ReturnType<import('magic-string').default['generateMap']>;
}

export type TypegpuTransform = (
  code: string,
  id: string,
  warn?: (message: string) => void,
) => TypegpuTransformResult | undefined;

/**
 * Creates the transform unplugin-typegpu applies to each module, for tools that
 * run it as part of their own plugin (e.g. `@typegpu/prune`).
 * Applies the same `include`/`exclude` filters and early pruning as the plugin.
 */
export function createTypegpuTransform(options?: Options): TypegpuTransform {
  const plugin = unpluginFactory(options, { framework: 'unloader' });
  const filter = createFilterForId(plugin.transform.filter.id);

  return (code, id, warn = (message) => console.warn(`[unplugin-typegpu] ${message}`)) => {
    if (filter && !filter(id)) {
      return undefined;
    }
    if (options?.earlyPruning !== false && earlyPruneRegex.every((p) => !p.test(code))) {
      return undefined;
    }
    const context = { warn } as UnpluginBuildContext & UnpluginContext;
    return plugin.transform.handler.call(context, code, id) as TypegpuTransformResult | undefined;
  };
}
