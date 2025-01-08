import type { JitTranspiler } from '../../jitTranspiler';
import { RandomNameRegistry, StrictNameRegistry } from '../../nameRegistry';
import { resolve as resolveImpl } from '../../resolutionCtx';
import type { SelfResolvable, Wgsl } from '../../types';
import { applyExternals, replaceExternalsInWgsl } from './externals';

export interface TgpuResolveOptions {
  externals: Record<string, Wgsl>;
  template?: string | undefined;
  /**
   * @default 'random'
   */
  names?: 'strict' | 'random' | undefined;
  jitTranspiler?: JitTranspiler | undefined;
}

export function resolve(options: TgpuResolveOptions): string {
  const { externals, template, names, jitTranspiler } = options;

  const dependencies = {} as Record<string, Wgsl>;
  applyExternals(dependencies, externals ?? {});

  const resolutionObj: SelfResolvable = {
    '~resolve'(ctx) {
      return replaceExternalsInWgsl(ctx, dependencies, template ?? '');
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
