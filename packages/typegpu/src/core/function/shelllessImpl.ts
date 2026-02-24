import type { ResolvedSnippet } from '../../data/snippet.ts';
import type { BaseData } from '../../data/wgslTypes.ts';
import { getName } from '../../shared/meta.ts';
import { $getNameForward, $internal, $resolve } from '../../shared/symbols.ts';
import type { ResolutionCtx, SelfResolvable } from '../../types.ts';
import { createFnCore } from './fnCore.ts';

/**
 * Shell-less functions are possible because we can infer the signature based solely on the context
 * around the function.
 *
 * ## Arguments
 * The snippets of the function's arguments are used to infer the types of the function's arguments.
 * We only care that the arguments are of a concrete type (we concretize them if they're not). We
 * cache these signatures based on the argument types, so that we can reuse them across calls.
 *
 * ## Return type
 * In shelled functions, the return type is known when generating the body, but in the case of shell-less functions,
 * we gather candidates for return types when visiting return statement nodes, and try to unify them into one type
 * before generating the signature.
 *
 * TODO: This behavior can be refined by considering the "expected type" of the function call expression.
 */
export interface ShelllessImpl extends SelfResolvable {
  readonly resourceType: 'shellless-impl';
  readonly argTypes: BaseData[];
  readonly [$getNameForward]: unknown;
}

export function createShelllessImpl(
  argTypes: BaseData[],
  implementation: (...args: never[]) => unknown,
): ShelllessImpl {
  const core = createFnCore(implementation, '');

  return {
    [$internal]: true,
    [$getNameForward]: core,
    resourceType: 'shellless-impl' as const,
    argTypes,

    [$resolve](ctx: ResolutionCtx): ResolvedSnippet {
      return core.resolve(ctx, argTypes, undefined);
    },

    toString(): string {
      return `fn*:${getName(core) ?? '<unnamed>'}(${
        argTypes.map((t) => t.toString()).join(', ')
      })`;
    },
  };
}
