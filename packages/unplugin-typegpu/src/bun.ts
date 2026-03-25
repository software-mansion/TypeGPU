import defu from 'defu';
import { defaultOptions, earlyPruneRegex, type Options } from './common.ts';
import { unpluginFactory } from './factory.ts';
import { UnpluginBuildContext, UnpluginContext } from 'unplugin';

export default (rawOptions?: Options): Bun.BunPlugin => {
  const options = defu(rawOptions, defaultOptions);
  const include = options.include;
  if (!(include instanceof RegExp)) {
    throw new Error(
      `Unsupported 'include' options in Bun plugin. Please provide a single regular expression`,
    );
  }
  if (options.exclude) {
    throw new Error(`Unsupported 'exclude' option in Bun plugin`);
  }

  const rawPlugin = unpluginFactory(rawOptions, { framework: 'bun' });

  return {
    name: 'unplugin-typegpu',
    setup(build) {
      build.onLoad({ filter: include }, async (args) => {
        const codeIn = await Bun.file(args.path).text();

        // Pruning early before more expensive operations
        if (earlyPruneRegex.every((pattern) => !pattern.test(codeIn))) {
          return {
            contents: codeIn,
            loader: args.loader,
          };
        }

        const result = await rawPlugin.transform.handler.apply(
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
