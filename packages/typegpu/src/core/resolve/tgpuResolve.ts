import { JitTranspiler } from '../../../../jit';
import { StrictNameRegistry } from '../../nameRegistry';
import { ResolutionCtxImpl } from '../../resolutionCtx';
import type { TgpuResolvable } from '../../types';
import { applyExternals, replaceExternalsInWgsl } from '../function/externals';

export function resolve(
  input: string | TgpuResolvable | (string | TgpuResolvable)[],
  extraDependencies?: Record<string, TgpuResolvable>,
): string {
  const context = new ResolutionCtxImpl({
    names: new StrictNameRegistry(),
    jitTranspiler: new JitTranspiler(),
  });

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

  return context.resolve(resolutionObj);
}
