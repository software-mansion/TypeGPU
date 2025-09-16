import type { AnyData } from '../../data/dataTypes.ts';
import type { ResolvedSnippet } from '../../data/snippet.ts';
import { getName } from '../../shared/meta.ts';
import { $getNameForward, $internal } from '../../shared/symbols.ts';
import type { ResolutionCtx, SelfResolvable } from '../../types.ts';
import { createFnCore } from './fnCore.ts';

export interface ShelllessImpl extends SelfResolvable {
  readonly resourceType: 'shellless-impl';
  readonly [$getNameForward]: unknown;
}

export function createShelllessImpl(
  argTypes: AnyData[],
  implementation: (...args: never[]) => unknown,
): ShelllessImpl {
  const core = createFnCore(implementation, '');

  return {
    [$internal]: true,
    [$getNameForward]: core,
    resourceType: 'shellless-impl' as const,

    '~resolve'(ctx: ResolutionCtx): ResolvedSnippet {
      return core.resolve(ctx, argTypes, undefined);
    },

    toString(): string {
      return `shellless-impl:${getName(core) ?? '<unnamed>'}`;
    },
  };
}
