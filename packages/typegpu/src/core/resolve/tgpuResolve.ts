import type { AnyWgslData } from '../../data/wgslTypes';
import type { JitTranspiler } from '../../jitTranspiler';
import { RandomNameRegistry, StrictNameRegistry } from '../../nameRegistry';
import { resolve as resolveImpl } from '../../resolutionCtx';
import type { TgpuResolvable } from '../../types';
import { applyExternals, replaceExternalsInWgsl } from './externals';

export interface TgpuResolveOptions {
  externals: Record<string, TgpuResolvable | AnyWgslData | boolean | number>;
  template?: string | undefined;
  /**
   * @default 'random'
   */
  names?: 'strict' | 'random' | undefined;
  unstable_jitTranspiler?: JitTranspiler | undefined;
}

export function resolve(options: TgpuResolveOptions): string {
  const {
    externals,
    template,
    names,
    unstable_jitTranspiler: jitTranspiler,
  } = options;

  const dependencies = {} as Record<string, TgpuResolvable>;
  applyExternals(dependencies, externals ?? {});

  const resolutionObj: TgpuResolvable = {
    resolve(ctx) {
      return replaceExternalsInWgsl(ctx, dependencies, template ?? '');
    },

    toString: () => '<root>',
  };

  const { code } = resolveImpl(resolutionObj, {
    names:
      names === 'strict' ? new StrictNameRegistry() : new RandomNameRegistry(),
    jitTranspiler: jitTranspiler,
  });

  return code;
}
