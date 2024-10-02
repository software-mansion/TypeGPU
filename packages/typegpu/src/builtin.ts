import type { vec3u, vec4f } from './data';

import {
  type BuiltinName,
  builtinNameToSymbol,
} from './builtinIdentifiers';
import { code } from './tgpuCode';
import type { ResolutionCtx, TgpuResolvable } from './types';

export interface TgpuBuiltin extends TgpuResolvable {
  readonly name: BuiltinName;
  readonly s: symbol;
}

class TgpuBuiltinImpl implements TgpuBuiltin {
  public readonly s: symbol;

  constructor(public readonly name: BuiltinName) {
    this.s = builtinNameToSymbol.get(name) as symbol;
  }

  get label() {
    return this.name;
  }

  resolve(ctx: ResolutionCtx): string {
    return ctx.resolve(code`${this.s}`);
  }
}

export type BuiltinVertexIndex = TgpuBuiltin & number;
export type BuiltinInstanceIndex = TgpuBuiltin & number;
export type BuiltinPosition = TgpuBuiltin & vec4f;
export type BuiltinClipDistances = TgpuBuiltin & number[];
export type BuiltinFrontFacing = TgpuBuiltin & boolean;
export type BuiltinFragDepth = TgpuBuiltin & number;
export type BuiltinSampleIndex = TgpuBuiltin & number;
export type BuiltinSampleMask = TgpuBuiltin & vec4f;
export type BuiltinFragment = TgpuBuiltin & vec4f;
export type BuiltinLocalInvocationId = TgpuBuiltin & vec3u;
export type BuiltinLocalInvocationIndex = TgpuBuiltin & number;
export type BuiltinGlobalInvocationId = TgpuBuiltin & vec3u;
export type BuiltinWorkgroupId = TgpuBuiltin & vec3u;
export type BuiltinNumWorkgroups = TgpuBuiltin & vec3u;

export const builtin = {
  vertexIndex: new TgpuBuiltinImpl('vertex_index') as BuiltinVertexIndex,
  instanceIndex: new TgpuBuiltinImpl('instance_index') as BuiltinInstanceIndex,
  position: new TgpuBuiltinImpl('position') as BuiltinPosition,
  clipDistances: new TgpuBuiltinImpl('clip_distances') as BuiltinClipDistances,
  frontFacing: new TgpuBuiltinImpl('front_facing') as BuiltinFrontFacing,
  fragDepth: new TgpuBuiltinImpl('frag_depth') as BuiltinFragDepth,
  sampleIndex: new TgpuBuiltinImpl('sample_index') as BuiltinSampleIndex,
  sampleMask: new TgpuBuiltinImpl('sample_mask') as BuiltinSampleMask,
  fragment: new TgpuBuiltinImpl('fragment') as BuiltinFragment,
  localInvocationId: new TgpuBuiltinImpl(
    'local_invocation_id',
  ) as BuiltinLocalInvocationId,
  localInvocationIndex: new TgpuBuiltinImpl(
    'local_invocation_index',
  ) as BuiltinLocalInvocationIndex,
  globalInvocationId: new TgpuBuiltinImpl(
    'global_invocation_id',
  ) as BuiltinGlobalInvocationId,
  workgroupId: new TgpuBuiltinImpl('workgroup_id') as BuiltinWorkgroupId,
  numWorkgroups: new TgpuBuiltinImpl('num_workgroups') as BuiltinNumWorkgroups,
} as const;

type Builtin = (typeof builtin)[keyof typeof builtin];

export type OmitBuiltins<S extends object> = {
  [Key in keyof S as S[Key] extends Builtin ? never : Key]: S[Key];
};
