import defu from 'defu';
import { checkOpts, defaultOptions, earlyPruneRegex, type Options } from './core/common.ts';
import { unpluginFactory } from './core/factory.ts';
import { createFilterForId } from './core/filter.ts';
import type { UnpluginBuildContext, UnpluginContext } from 'unplugin';

export default (rawOptions?: Options): Bun.BunPlugin => {
  const options = checkOpts(defu(rawOptions, defaultOptions));
  const include = options.include;
  if (!(include instanceof RegExp)) {
    throw new Error(
      `Unsupported 'include' options in Bun plugin. Please provide a single regular expression`,
    );
  }
  // Bun's `onLoad` filter only accepts a single regex, so exclusion is handled manually
  const isIncluded = createFilterForId({ exclude: options.exclude });

  const rawPlugin = unpluginFactory(rawOptions, { framework: 'bun' });

  return {
    name: 'unplugin-typegpu',
    setup(build) {
      build.onLoad({ filter: include }, async (args) => {
        const codeIn = await Bun.file(args.path).text();

        if (isIncluded && !isIncluded(args.path)) {
          return {
            contents: codeIn,
            loader: args.loader,
          };
        }

        // Pruning early before more expensive operations
        if (options.earlyPruning && earlyPruneRegex.every((pattern) => !pattern.test(codeIn))) {
          return {
            contents: codeIn,
            loader: args.loader,
          };
        }

        const result = rawPlugin.transform.handler.apply(
          {} as UnpluginBuildContext & UnpluginContext,
          [codeIn, args.path],
        );

        return {
          contents: result?.code ?? codeIn,
          loader: args.loader,
        };
      });
    },
  };
};
