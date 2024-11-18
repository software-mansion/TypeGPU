import type { JitTranspiler } from '../../jitTranspiler';
import { RandomNameRegistry, StrictNameRegistry } from '../../nameRegistry';
import { resolve as resolveImpl } from '../../resolutionCtx';
import type { TgpuResolvable } from '../../types';
import { applyExternals, replaceExternalsInWgsl } from '../function/externals';

export interface TgpuResolveOptions {
  input: string | TgpuResolvable | (string | TgpuResolvable)[];
  extraDependencies?: Record<string, TgpuResolvable> | undefined;
  /**
   * @default 'random'
   */
  names?: 'strict' | 'random' | undefined;
  jitTranspiler?: JitTranspiler | undefined;
}

export function resolve(options: TgpuResolveOptions): string {
  const { input, extraDependencies, names, jitTranspiler } = options;

  const dependencies = {} as Record<string, TgpuResolvable>;
  applyExternals(dependencies, extraDependencies ?? {});

  const stringCode = (Array.isArray(input) ? input : [input]).filter(
    (item) => typeof item === 'string',
  ) as string[];
  const resolvableCode = (Array.isArray(input) ? input : [input]).filter(
    (item) => typeof item !== 'string',
  ) as TgpuResolvable[];

  const resolutionObj: TgpuResolvable = {
    resolve(ctx) {
      const stringCodeResolved = stringCode.join('\n\n');
      for (const resolvable of resolvableCode) {
        ctx.resolve(resolvable);
      }
      return replaceExternalsInWgsl(ctx, dependencies, stringCodeResolved);
    },
  };

  const { code } = resolveImpl(resolutionObj, {
    names:
      names === 'strict' ? new StrictNameRegistry() : new RandomNameRegistry(),
    jitTranspiler: jitTranspiler,
  });

  return code;
}
