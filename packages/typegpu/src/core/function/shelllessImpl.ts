import type { AnyData } from '../../data/dataTypes.ts';
import { getName } from '../../shared/meta.ts';
import { $internal } from '../../shared/symbols.ts';
import type { ResolutionCtx, SelfResolvable } from '../../types.ts';
import { createFnCore } from './fnCore.ts';

export interface ShelllessImpl extends SelfResolvable {
  readonly resourceType: 'shellless-function';
}

export function createShelllessImpl(
  argTypes: AnyData[],
  implementation: (...args: never[]) => unknown,
): ShelllessImpl {
  const core = createFnCore(implementation, '');

  return {
    [$internal]: true,
    resourceType: 'shellless-function' as const,

    '~resolve'(ctx: ResolutionCtx): string {
      return core.resolve(ctx, argTypes, undefined);
    },

    toString(): string {
      return `shellless-impl:${getName(core) ?? '<unnamed>'}`;
    },
  };
}
