import type {
  IMeasurer,
  IRefResolver,
  ISchema,
  ISerialInput,
  ISerialOutput,
  MaxValue,
} from 'typed-binary';
import { RecursiveDataTypeError } from '.';
import { type BuiltinName, builtinNameToSymbol } from './builtinIdentifiers';
import {
  type F32,
  type Parsed,
  type TgpuArray,
  type U32,
  type Unwrap,
  type Vec3u,
  type Vec4f,
  arrayOf,
  f32,
  u32,
  vec3u,
  vec4f,
} from './data';
import { code } from './tgpuCode';
import type {
  AnyTgpuData,
  ResolutionCtx,
  TgpuData,
  TgpuResolvable,
} from './types';

// --------------
// Implementation
// --------------

class TgpuBuiltinImpl<T extends AnyTgpuData> implements TgpuBuiltin<T> {
  // Type-token, not available at runtime
  public readonly __unwrapped!: Unwrap<T>;

  public readonly s: symbol;
  public readonly size: number;
  public readonly byteAlignment: number;
  public readonly isLoose = false as const;
  public readonly isCustomAligned = false;

  constructor(
    public readonly name: BuiltinName,
    public readonly dataType: T,
  ) {
    this.s = builtinNameToSymbol.get(name) as symbol;
    this.size = dataType.size;
    this.byteAlignment = dataType.byteAlignment;
  }

  resolveReferences(_ctx: IRefResolver): void {
    throw new RecursiveDataTypeError();
  }

  write(output: ISerialOutput, value: Parsed<Unwrap<T>>): void {
    this.dataType.write(output, value);
  }

  read(input: ISerialInput): Parsed<Unwrap<T>> {
    return this.dataType.read(input) as Parsed<Unwrap<T>>;
  }

  measure(
    value: MaxValue | Parsed<Unwrap<T>>,
    measurer?: IMeasurer | undefined,
  ): IMeasurer {
    return this.dataType.measure(value, measurer);
  }

  seekProperty(
    reference: MaxValue | Parsed<Unwrap<T>>,
    prop: keyof Unwrap<T>,
  ): { bufferOffset: number; schema: ISchema<unknown> } | null {
    return this.dataType.seekProperty(reference, prop as never);
  }

  get label() {
    return this.name;
  }

  resolve(ctx: ResolutionCtx): string {
    return ctx.resolve(code`${this.s}`);
  }
}

// ----------
// Public API
// ----------

export interface TgpuBuiltin<T extends AnyTgpuData = AnyTgpuData>
  extends TgpuResolvable,
    TgpuData<Unwrap<T>> {
  readonly name: BuiltinName;
  readonly dataType: T;
  readonly byteAlignment: number;
  readonly s: symbol;
}

export type BuiltinVertexIndex = TgpuBuiltin<U32> & number;
export type BuiltinInstanceIndex = TgpuBuiltin<U32> & number;
export type BuiltinPosition = TgpuBuiltin<Vec4f> & vec4f;
export type BuiltinClipDistances = TgpuBuiltin<TgpuArray<U32>> & number[];
export type BuiltinFrontFacing = TgpuBuiltin<F32> & boolean;
export type BuiltinFragDepth = TgpuBuiltin<F32> & number;
export type BuiltinSampleIndex = TgpuBuiltin<U32> & number;
export type BuiltinSampleMask = TgpuBuiltin<U32> & vec4f;
export type BuiltinFragment = TgpuBuiltin<Vec4f> & vec4f;
export type BuiltinLocalInvocationId = TgpuBuiltin<Vec3u> & vec3u;
export type BuiltinLocalInvocationIndex = TgpuBuiltin<U32> & number;
export type BuiltinGlobalInvocationId = TgpuBuiltin<Vec3u> & vec3u;
export type BuiltinWorkgroupId = TgpuBuiltin<Vec3u> & vec3u;
export type BuiltinNumWorkgroups = TgpuBuiltin<Vec3u> & vec3u;

export const builtin = {
  vertexIndex: new TgpuBuiltinImpl(
    'vertex_index',
    u32,
  ) as unknown as BuiltinVertexIndex,
  instanceIndex: new TgpuBuiltinImpl(
    'instance_index',
    u32,
  ) as unknown as BuiltinInstanceIndex,
  position: new TgpuBuiltinImpl(
    'position',
    vec4f,
  ) as unknown as BuiltinPosition,
  clipDistances: new TgpuBuiltinImpl(
    'clip_distances',
    arrayOf(u32, 8),
  ) as unknown as BuiltinClipDistances,
  frontFacing: new TgpuBuiltinImpl(
    'front_facing',
    f32,
  ) as unknown as BuiltinFrontFacing,
  fragDepth: new TgpuBuiltinImpl(
    'frag_depth',
    f32,
  ) as unknown as BuiltinFragDepth,
  sampleIndex: new TgpuBuiltinImpl(
    'sample_index',
    u32,
  ) as unknown as BuiltinSampleIndex,
  sampleMask: new TgpuBuiltinImpl(
    'sample_mask',
    u32,
  ) as unknown as BuiltinSampleMask,
  fragment: new TgpuBuiltinImpl(
    'fragment',
    vec4f,
  ) as unknown as BuiltinFragment,
  localInvocationId: new TgpuBuiltinImpl(
    'local_invocation_id',
    vec3u,
  ) as unknown as BuiltinLocalInvocationId,
  localInvocationIndex: new TgpuBuiltinImpl(
    'local_invocation_index',
    u32,
  ) as unknown as BuiltinLocalInvocationIndex,
  globalInvocationId: new TgpuBuiltinImpl(
    'global_invocation_id',
    vec3u,
  ) as unknown as BuiltinGlobalInvocationId,
  workgroupId: new TgpuBuiltinImpl(
    'workgroup_id',
    vec3u,
  ) as unknown as BuiltinWorkgroupId,
  numWorkgroups: new TgpuBuiltinImpl(
    'num_workgroups',
    vec3u,
  ) as unknown as BuiltinNumWorkgroups,
} as const;

export type AnyBuiltin = (typeof builtin)[keyof typeof builtin];

export type OmitBuiltins<S extends object> = {
  [Key in keyof S as S[Key] extends AnyBuiltin ? never : Key]: S[Key];
};

export function isBuiltin<T extends AnyBuiltin>(
  value: T | unknown,
): value is T {
  return value instanceof TgpuBuiltinImpl;
}
