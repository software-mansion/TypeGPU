import type { Unwrap } from 'typed-binary';
import { isArraySchema } from './data';
import { inGPUMode } from './gpuMode';
import {
  type Storage,
  type TgpuBuffer,
  type Uniform,
  type Vertex,
  isUsableAsStorage,
  isUsableAsUniform,
  isUsableAsVertex,
} from './tgpuBuffer';
import { identifier } from './tgpuIdentifier';
import type {
  AnyTgpuData,
  BufferUsage,
  ResolutionCtx,
  TgpuBindable,
} from './types';

// ----------
// Public API
// ----------
export interface TgpuBufferUniform<TData extends AnyTgpuData>
  extends TgpuBindable<TData, 'uniform'> {
  readonly resourceType: 'buffer-usage';
  readonly value: Unwrap<TData>;
}

export interface TgpuBufferReadonly<TData extends AnyTgpuData>
  extends TgpuBindable<TData, 'readonly'> {
  readonly resourceType: 'buffer-usage';
  readonly value: Unwrap<TData>;
}

export interface TgpuBufferMutable<TData extends AnyTgpuData>
  extends TgpuBindable<TData, 'mutable'> {
  readonly resourceType: 'buffer-usage';
  value: Unwrap<TData>;
}

export interface TgpuBufferVertex<TData extends AnyTgpuData>
  extends TgpuBindable<TData, 'vertex'> {
  readonly resourceType: 'buffer-usage';
  vertexLayout: Omit<GPUVertexBufferLayout, 'attributes'>;
}

export interface TgpuBufferUsage<
  TData extends AnyTgpuData,
  TUsage extends BufferUsage = BufferUsage,
> extends TgpuBindable<TData, TUsage> {
  readonly resourceType: 'buffer-usage';
  value: Unwrap<TData>;
}

export function isBufferUsage<
  T extends
    | TgpuBufferUniform<AnyTgpuData>
    | TgpuBufferReadonly<AnyTgpuData>
    | TgpuBufferMutable<AnyTgpuData>
    | TgpuBufferVertex<AnyTgpuData>,
>(value: T | unknown): value is T {
  return !!value && (value as T).resourceType === 'buffer-usage';
}

// --------------
// Implementation
// --------------

class TgpuBufferUsageImpl<TData extends AnyTgpuData, TUsage extends BufferUsage>
  implements TgpuBufferUsage<TData, TUsage>
{
  public readonly resourceType = 'buffer-usage' as const;

  constructor(
    public readonly buffer: TgpuBuffer<TData>,
    public readonly usage: TUsage,
  ) {}

  get label() {
    return this.buffer.label;
  }

  get allocatable() {
    return this.buffer;
  }

  $name(label: string) {
    this.buffer.$name(label);
  }

  resolve(ctx: ResolutionCtx): string {
    const ident = identifier().$name(this.label);
    ctx.addBinding(this, ident);
    return ctx.resolve(ident);
  }

  toString(): string {
    return `${this.usage}:${this.label ?? '<unnamed>'}`;
  }

  get value(): Unwrap<TData> {
    if (!inGPUMode()) {
      throw new Error(`Cannot access buffer's value directly in JS.`);
    }
    return this as Unwrap<TData>;
  }
}

class TgpuBufferVertexImpl<TData extends AnyTgpuData>
  implements TgpuBufferVertex<TData>
{
  public readonly resourceType = 'buffer-usage' as const;
  public readonly usage = 'vertex';
  public readonly vertexLayout: Omit<GPUVertexBufferLayout, 'attributes'>;

  constructor(
    public readonly allocatable: TgpuBuffer<TData>,
    stepMode: 'vertex' | 'instance',
  ) {
    const layout = getVertexLayoutIfValid(allocatable.dataType, stepMode);
    if (!layout) {
      throw new Error('Cannot create vertex buffer with complex data types.');
    }
    this.vertexLayout = layout;
  }

  get label() {
    return this.allocatable.label;
  }

  resolve(ctx: ResolutionCtx): string {
    const ident = identifier().$name(this.label);
    ctx.addBinding(this, ident);
    return ctx.resolve(ident);
  }

  toString(): string {
    return `vertex:${this.label ?? '<unnamed>'}`;
  }
}

const mutableUsageMap = new WeakMap<
  TgpuBuffer<AnyTgpuData>,
  TgpuBufferUsageImpl<AnyTgpuData, 'mutable'>
>();

export function asMutable<TData extends AnyTgpuData>(
  buffer: TgpuBuffer<TData> & Storage,
): TgpuBufferMutable<TData> {
  if (!isUsableAsStorage(buffer)) {
    throw new Error(
      `Cannot pass ${buffer} to asMutable, as it is not allowed to be used as storage. To allow it, call .$usage(tgpu.Storage) when creating the buffer.`,
    );
  }

  let usage = mutableUsageMap.get(buffer);
  if (!usage) {
    usage = new TgpuBufferUsageImpl(buffer, 'mutable');
    mutableUsageMap.set(buffer, usage);
  }
  return usage as unknown as TgpuBufferMutable<TData>;
}

const readonlyUsageMap = new WeakMap<
  TgpuBuffer<AnyTgpuData>,
  TgpuBufferUsageImpl<AnyTgpuData, 'readonly'>
>();

export function asReadonly<TData extends AnyTgpuData>(
  buffer: TgpuBuffer<TData> & Storage,
): TgpuBufferReadonly<TData> {
  if (!isUsableAsStorage(buffer)) {
    throw new Error(
      `Cannot pass ${buffer} to asReadonly, as it is not allowed to be used as storage. To allow it, call .$usage(tgpu.Storage) when creating the buffer.`,
    );
  }

  let usage = readonlyUsageMap.get(buffer);
  if (!usage) {
    usage = new TgpuBufferUsageImpl(buffer, 'readonly');
    readonlyUsageMap.set(buffer, usage);
  }
  return usage as unknown as TgpuBufferReadonly<TData>;
}

const uniformUsageMap = new WeakMap<
  TgpuBuffer<AnyTgpuData>,
  TgpuBufferUsageImpl<AnyTgpuData, 'uniform'>
>();

export function asUniform<TData extends AnyTgpuData>(
  buffer: TgpuBuffer<TData> & Uniform,
): TgpuBufferUniform<TData> {
  if (!isUsableAsUniform(buffer)) {
    throw new Error(
      `Cannot pass ${buffer} to asUniform, as it is not allowed to be used as a uniform. To allow it, call .$usage(tgpu.Uniform) when creating the buffer.`,
    );
  }

  let usage = uniformUsageMap.get(buffer);
  if (!usage) {
    usage = new TgpuBufferUsageImpl(buffer, 'uniform');
    uniformUsageMap.set(buffer, usage);
  }
  return usage as unknown as TgpuBufferUniform<TData>;
}

const vertexUsageMap = new WeakMap<
  TgpuBuffer<AnyTgpuData>,
  {
    vertex: TgpuBufferVertexImpl<AnyTgpuData>;
    instance: TgpuBufferVertexImpl<AnyTgpuData>;
  }
>();

export function asVertex<TData extends AnyTgpuData>(
  buffer: TgpuBuffer<TData> & Vertex,
  stepMode: 'vertex' | 'instance',
): TgpuBufferVertex<TData> {
  if (!isUsableAsVertex(buffer)) {
    throw new Error(
      `Cannot pass ${buffer} to asVertex, as it is not allowed to be used as a vertex buffer. To allow it, call .$usage(tgpu.Vertex) when creating the buffer.`,
    );
  }

  let usage = vertexUsageMap.get(buffer);
  if (!usage) {
    usage = {
      vertex: new TgpuBufferVertexImpl(buffer, 'vertex'),
      instance: new TgpuBufferVertexImpl(buffer, 'instance'),
    };
    vertexUsageMap.set(buffer, usage);
  }
  return usage[stepMode] as unknown as TgpuBufferVertex<TData>;
}

function getVertexLayoutIfValid(
  type: AnyTgpuData,
  stepMode: 'vertex' | 'instance',
): Omit<GPUVertexBufferLayout, 'attributes'> | null {
  // check if the type is a primitive (f32, i32, u32, or a vector)
  if ('expressionCode' in type) {
    return {
      arrayStride: type.size,
      stepMode: stepMode,
    };
  }
  // if the data type is an array, check if the element type is valid
  // as arrayOf(arrayOf(f32, x), y) would still be valid - we do it recursively
  if (isArraySchema(type)) {
    return getVertexLayoutIfValid(type.elementType, stepMode);
  }
  return null;
}
