import { AutoStruct } from '../../data/autoStruct.ts';
import { bool, u32 } from '../../data/numeric.ts';
import type { ResolvedSnippet } from '../../data/snippet.ts';
import { vec4f } from '../../data/vector.ts';
import type { AnyVecInstance, v4f } from '../../data/wgslTypes.ts';
import { $internal, $resolve } from '../../shared/symbols.ts';
import type { ResolutionCtx, SelfResolvable } from '../../types.ts';
import { createFnCore, type FnCore } from './fnCore.ts';

export type AnyAutoCustoms = Record<string, number | AnyVecInstance>;

export type AutoVertexIn<T extends AnyAutoCustoms> =
  & T
  & {
    // builtins
    $vertexIndex: number;
    $instanceIndex: number;
  };

export type AutoVertexOut<T extends AnyAutoCustoms> =
  & T
  & {
    // builtins
    $clipDistances?: number[] | undefined;
    $position?: v4f | undefined;
  };

// const builtinFragmentIn = {
//   '$position': vec4f,
//   '$frontFacing': bool,
//   '$primitiveIndex': u32,
//   '$sampleIndex',
//   '$sampleMask',
//   '$subgroupInvocationId',
//   '$subgroupSize',
// } as const;

export type AutoFragmentIn<T extends AnyAutoCustoms> =
  & T
  & {
    // builtins
    $position: v4f;
    $frontFacing: boolean;
    $primitiveIndex: number;
    $sampleIndex: number;
    $sampleMask: number;
    $subgroupInvocationId: number;
    $subgroupSize: number;
  };

export type AutoFragmentOut<T extends undefined | v4f | AnyAutoCustoms> =
  T extends undefined | v4f ? T
    : {
      // builtins
      $fragDepth?: number | undefined;
      $sampleMask?: number | undefined;
    };

type AutoFragmentFnImpl = (
  input: AutoFragmentIn<AnyAutoCustoms>,
) => AutoFragmentOut<undefined | v4f | AnyAutoCustoms>;

/**
 * Only used internally
 */
export class AutoFragmentFn implements SelfResolvable {
  // Prototype properties
  declare [$internal]: true;
  declare resourceType: 'auto-fragment-fn';

  impl: AutoFragmentFnImpl;
  autoIn: AutoStruct;

  #core: FnCore;

  constructor(impl: AutoFragmentFnImpl, varyings: AnyAutoCustoms) {
    this.impl = impl;
    this.autoIn = new AutoStruct([
      ...builtinFragmentIn,
      ...Object.keys(varyings),
    ]);
    this.#core = createFnCore(impl, '@fragment ');
  }

  [$resolve](ctx: ResolutionCtx): ResolvedSnippet {
    return this.#core.resolve(ctx, [AUtoS], undefined);
  }
}

AutoFragmentFn.prototype[$internal] = true;
AutoFragmentFn.prototype.resourceType = 'auto-fragment-fn';
