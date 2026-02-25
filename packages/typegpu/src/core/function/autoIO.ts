import { builtin, type OmitBuiltins } from '../../builtin.ts';
import { AutoStruct } from '../../data/autoStruct.ts';
import type { ResolvedSnippet } from '../../data/snippet.ts';
import { vec4f } from '../../data/vector.ts';
import type { BaseData, v4f } from '../../data/wgslTypes.ts';
import { getName, setName } from '../../shared/meta.ts';
import type { InferGPU, InferGPURecord, InferRecord } from '../../shared/repr.ts';
import { $internal, $resolve } from '../../shared/symbols.ts';
import type { ResolutionCtx, SelfResolvable } from '../../types.ts';
import { createFnCore, type FnCore } from './fnCore.ts';
import type { BaseIOData } from './fnTypes.ts';

export type AnyAutoCustoms = Record<string, InferGPU<BaseIOData>>;

const builtinVertexIn = {
  $vertexIndex: builtin.vertexIndex,
  $instanceIndex: builtin.instanceIndex,
} as const;

export type AutoVertexIn<T extends AnyAutoCustoms> = T & InferRecord<typeof builtinVertexIn>;

const builtinVertexOut = {
  $clipDistances: builtin.clipDistances,
  $position: builtin.position,
} as const;

export type AutoVertexOut<T extends AnyAutoCustoms> = OmitBuiltins<T> &
  Partial<InferGPURecord<typeof builtinVertexOut>>;

const builtinFragmentIn = {
  $position: builtin.position,
  $frontFacing: builtin.frontFacing,
  $primitiveIndex: builtin.primitiveIndex,
  $sampleIndex: builtin.sampleIndex,
  $sampleMask: builtin.sampleMask,
  $subgroupInvocationId: builtin.subgroupInvocationId,
  $subgroupSize: builtin.subgroupSize,
} as const;

export type AutoFragmentIn<T extends AnyAutoCustoms> = T & InferRecord<typeof builtinFragmentIn>;

const builtinFragmentOut = {
  $fragDepth: builtin.fragDepth,
  $sampleMask: builtin.sampleMask,
} as const;

export type AutoFragmentOut<T extends undefined | v4f | AnyAutoCustoms> = T extends undefined | v4f
  ? T
  : T & Partial<InferGPURecord<typeof builtinFragmentOut>>;

type AutoFragmentFnImpl = (
  input: AutoFragmentIn<Record<string, never>>,
) => AutoFragmentOut<undefined | v4f | AnyAutoCustoms>;

/**
 * Only used internally
 */
export class AutoFragmentFn implements SelfResolvable {
  // Prototype properties
  declare [$internal]: true;
  declare resourceType: 'auto-fragment-fn';

  #core: FnCore;
  #autoIn: AutoStruct;
  #autoOut: AutoStruct;

  constructor(
    impl: AutoFragmentFnImpl,
    varyings: Record<string, BaseData>,
    locations?: Record<string, number>,
  ) {
    // If the implementation is not named, we can fallback to "fragmentFn"
    if (!getName(impl)) {
      setName(impl, 'fragmentFn');
    }
    this.#core = createFnCore(impl, '@fragment ');
    this.#autoIn = new AutoStruct({ ...builtinFragmentIn, ...varyings }, undefined, locations);
    setName(this.#autoIn, 'FragmentIn');
    this.#autoOut = new AutoStruct(builtinFragmentOut, vec4f);
    setName(this.#autoOut, 'FragmentOut');
  }

  toString(): string {
    return 'autoFragmentFn';
  }

  [$resolve](ctx: ResolutionCtx): ResolvedSnippet {
    return this.#core.resolve(ctx, [this.#autoIn], this.#autoOut);
  }
}

AutoFragmentFn.prototype[$internal] = true;
AutoFragmentFn.prototype.resourceType = 'auto-fragment-fn';

type AutoVertexFnImpl = (
  input: AutoVertexIn<Record<string, never>>,
) => AutoVertexOut<AnyAutoCustoms>;

/**
 * Only used internally
 */
export class AutoVertexFn implements SelfResolvable {
  // Prototype properties
  declare [$internal]: true;
  declare resourceType: 'auto-vertex-fn';

  #core: FnCore;
  #autoIn: AutoStruct;
  #autoOut: AutoStruct;

  constructor(
    impl: AutoVertexFnImpl,
    attribs: Record<string, BaseData>,
    locations?: Record<string, number>,
  ) {
    // If the implementation is not named, we can fallback to "vertexFn"
    if (!getName(impl)) {
      setName(impl, 'vertexFn');
    }
    this.#core = createFnCore(impl, '@vertex ');
    this.#autoIn = new AutoStruct({ ...builtinVertexIn, ...attribs }, undefined, locations);
    setName(this.#autoIn, 'VertexIn');
    this.#autoOut = new AutoStruct(builtinVertexOut, undefined);
    setName(this.#autoOut, 'VertexOut');
  }

  toString(): string {
    return 'autoVertexFn';
  }

  [$resolve](ctx: ResolutionCtx): ResolvedSnippet {
    return this.#core.resolve(ctx, [this.#autoIn], this.#autoOut);
  }
}

AutoVertexFn.prototype[$internal] = true;
AutoVertexFn.prototype.resourceType = 'auto-vertex-fn';
