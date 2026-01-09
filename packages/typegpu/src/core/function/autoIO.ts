import { builtin } from '../../builtin.ts';
import { AutoStruct } from '../../data/autoStruct.ts';
import type { AnyData } from '../../data/dataTypes.ts';
import type { ResolvedSnippet } from '../../data/snippet.ts';
import type { AnyVecInstance, v4f } from '../../data/wgslTypes.ts';
import type { InferRecord } from '../../shared/repr.ts';
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

const builtinFragmentIn = {
  '$position': builtin.position,
  '$frontFacing': builtin.frontFacing,
  '$primitiveIndex': builtin.primitiveIndex,
  '$sampleIndex': builtin.sampleIndex,
  '$sampleMask': builtin.sampleMask,
  '$subgroupInvocationId': builtin.subgroupInvocationId,
  '$subgroupSize': builtin.subgroupSize,
} as const;

export type AutoFragmentIn<T extends AnyAutoCustoms> =
  & T
  & InferRecord<typeof builtinFragmentIn>;

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

  constructor(
    impl: AutoFragmentFnImpl,
    varyings: Record<string, AnyData>,
    locations?: Record<string, number> | undefined,
  ) {
    this.impl = impl;
    this.autoIn = new AutoStruct({
      ...builtinFragmentIn,
      ...varyings,
    }, locations);
    this.#core = createFnCore(impl, '@fragment ');
  }

  [$resolve](ctx: ResolutionCtx): ResolvedSnippet {
    return this.#core.resolve(ctx, [this.autoIn], undefined);
  }
}

AutoFragmentFn.prototype[$internal] = true;
AutoFragmentFn.prototype.resourceType = 'auto-fragment-fn';
