import type { JitTranspiler } from '../../jitTranspiler';
import { RandomNameRegistry, StrictNameRegistry } from '../../nameRegistry';
import { resolve as resolveImpl } from '../../resolutionCtx';
import type { ResolvableObject, SelfResolvable, Wgsl } from '../../types';
import { applyExternals, replaceExternalsInWgsl } from './externals';

export interface TgpuResolveOptions {
  input: string | ResolvableObject | (string | ResolvableObject)[];
  extraDependencies?: Record<string, Wgsl> | undefined;
  /**
   * @default 'random'
   */
  names?: 'strict' | 'random' | undefined;
  jitTranspiler?: JitTranspiler | undefined;
}

export function resolve(options: TgpuResolveOptions): string {
  const { input, extraDependencies, names, jitTranspiler } = options;

  const dependencies = {} as Record<string, Wgsl>;
  applyExternals(dependencies, extraDependencies ?? {});

  const stringCode = (Array.isArray(input) ? input : [input]).filter(
    (item) => typeof item === 'string',
  );
  const resolvableCode = (Array.isArray(input) ? input : [input]).filter(
    (item) => typeof item !== 'string',
  );

  const resolutionObj: SelfResolvable = {
    '~resolve'(ctx) {
      const stringCodeResolved = stringCode.join('\n\n');
      for (const resolvable of resolvableCode) {
        ctx.resolve(resolvable);
      }
      return replaceExternalsInWgsl(ctx, dependencies, stringCodeResolved);
    },
  };

  Object.defineProperty(resolutionObj, 'toString', {
    value: () => '<root>',
  });

  const { code } = resolveImpl(resolutionObj, {
    names:
      names === 'strict' ? new StrictNameRegistry() : new RandomNameRegistry(),
    jitTranspiler: jitTranspiler,
  });

  return code;
}
