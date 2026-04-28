import { getCompiledWriter } from '../../data/compiledIO.ts';
import type { AnyData } from '../../data/dataTypes.ts';
import { convertPartialToPatch, getPatchInstructions } from '../../data/partialIO.ts';
import { sizeOf } from '../../data/sizeOf.ts';
import type { BaseData } from '../../data/wgslTypes.ts';
import { isWgslArray, isWgslData } from '../../data/wgslTypes.ts';
import type { StorageFlag } from '../../extension.ts';
import type { TgpuNamable } from '../../shared/meta.ts';
import { getName, setName } from '../../shared/meta.ts';
import type {
  Infer,
  InferInput,
  InferPatch,
  InferPartial,
  IsValidIndexSchema,
  IsValidStorageSchema,
  IsValidUniformSchema,
  IsValidVertexSchema,
  MemIdentity,
} from '../../shared/repr.ts';
import { $internal } from '../../shared/symbols.ts';
import type { Prettify, UnionToIntersection } from '../../shared/utilityTypes.ts';
import { isGPUBuffer } from '../../types.ts';
import type { ExperimentalTgpuRoot } from '../root/rootTypes.ts';
import {
  mutable,
  readonly,
  type TgpuBufferMutable,
  type TgpuBufferReadonly,
  type TgpuBufferUniform,
  type TgpuFixedBufferUsage,
  uniform,
} from './bufferUsage.ts';
import { alignmentOf } from '../../data/alignmentOf.ts';
import { roundUp } from '../../mathUtils.ts';
import { readFromArrayBuffer, writeToArrayBuffer } from '../../data/dataIO.ts';
import { patchArrayBuffer } from '../../data/partialIO.ts';

// ----------
// Public API
// ----------

export interface UniformFlag {
  usableAsUniform: true;
}

/**
 * @deprecated Use UniformFlag instead.
 */
export type Uniform = UniformFlag;

export interface VertexFlag {
  usableAsVertex: true;
}

export interface IndexFlag {
  usableAsIndex: true;
}

export interface IndirectFlag {
  usableAsIndirect: true;
}

/**
 * @deprecated Use VertexFlag instead.
 */
export type Vertex = VertexFlag;

type UsageLiteral = 'uniform' | 'storage' | 'vertex' | 'index' | 'indirect';

type LiteralToUsageType<T extends UsageLiteral> = T extends 'uniform'
  ? UniformFlag
  : T extends 'storage'
    ? StorageFlag
    : T extends 'vertex'
      ? VertexFlag
      : T extends 'index'
        ? IndexFlag
        : T extends 'indirect'
          ? IndirectFlag
          : never;

type ViewUsages<TBuffer extends TgpuBuffer<BaseData>> =
  | (boolean extends TBuffer['usableAsUniform'] ? never : 'uniform')
  | (boolean extends TBuffer['usableAsStorage'] ? never : 'readonly' | 'mutable');

type UsageTypeToBufferUsage<TData extends BaseData> = {
  uniform: TgpuBufferUniform<TData> & TgpuFixedBufferUsage<TData>;
  mutable: TgpuBufferMutable<TData> & TgpuFixedBufferUsage<TData>;
  readonly: TgpuBufferReadonly<TData> & TgpuFixedBufferUsage<TData>;
};

const usageToUsageConstructor = { uniform, mutable, readonly };

/**
 * Done as an object to later Prettify it
 */
type InnerValidUsagesFor<T> = {
  usage:
    | (IsValidStorageSchema<T> extends true ? 'storage' : never)
    | (IsValidUniformSchema<T> extends true ? 'uniform' : never)
    | (IsValidVertexSchema<T> extends true ? 'vertex' : never)
    | (IsValidIndexSchema<T> extends true ? 'index' : never)
    // there is no way to check at the type level if a buffer can be used as indirect (size >= 12 bytes)
    | 'indirect';
};

export type ValidUsagesFor<T> = InnerValidUsagesFor<T>['usage'];

export type BufferWriteOptions = {
  startOffset?: number;
  endOffset?: number;
};

export type BufferInitCallback<TData extends BaseData> = (buffer: TgpuBuffer<TData>) => void;
export type BufferInitialData<TData extends BaseData> =
  | InferInput<TData>
  | BufferInitCallback<TData>;

export interface TgpuBuffer<TData extends BaseData> extends TgpuNamable {
  readonly [$internal]: true;
  readonly resourceType: 'buffer';
  readonly dataType: TData;
  readonly initial?: InferInput<TData> | undefined;
  readonly arrayBuffer: ArrayBuffer;

  readonly buffer: GPUBuffer;
  readonly destroyed: boolean;

  usableAsUniform: boolean;
  usableAsStorage: boolean;
  usableAsVertex: boolean;
  usableAsIndex: boolean;
  usableAsIndirect: boolean;

  $usage<
    T extends [
      Prettify<InnerValidUsagesFor<TData>>['usage'],
      ...Prettify<InnerValidUsagesFor<TData>>['usage'][],
    ],
  >(
    ...usages: T
  ): this & UnionToIntersection<LiteralToUsageType<T[number]>>;
  $addFlags(flags: GPUBufferUsageFlags): this;

  as<T extends ViewUsages<this>>(usage: T): UsageTypeToBufferUsage<TData>[T];

  compileWriter(): void;
  write(data: InferInput<TData>, options?: BufferWriteOptions): void;
  write(data: ArrayBuffer, options?: BufferWriteOptions): void;
  /** @deprecated Use {@link patch} instead. */
  writePartial(data: InferPartial<TData>): void;
  patch(data: InferPatch<TData>): void;
  clear(): void;
  copyFrom(srcBuffer: TgpuBuffer<MemIdentity<TData>>): void;
  read(): Promise<Infer<TData>>;
  destroy(): void;
  toString(): string;
}

export function INTERNAL_createBuffer<TData extends AnyData>(
  group: ExperimentalTgpuRoot,
  typeSchema: TData,
  initialOrBuffer?: BufferInitialData<TData> | GPUBuffer,
): TgpuBuffer<TData> {
  if (!isWgslData(typeSchema)) {
    return new TgpuBufferImpl(group, typeSchema, initialOrBuffer, ['storage', 'uniform']);
  }

  return new TgpuBufferImpl(group, typeSchema, initialOrBuffer);
}

export function isBuffer(value: unknown): value is TgpuBuffer<BaseData> {
  return (value as TgpuBuffer<BaseData>).resourceType === 'buffer';
}

export function isUsableAsVertex<T extends TgpuBuffer<BaseData>>(
  buffer: T,
): buffer is T & VertexFlag {
  return !!buffer.usableAsVertex;
}

export function isUsableAsIndex<T extends TgpuBuffer<BaseData>>(
  buffer: T,
): buffer is T & IndexFlag {
  return !!buffer.usableAsIndex;
}

// --------------
// Implementation
// --------------
class TgpuBufferImpl<TData extends BaseData> implements TgpuBuffer<TData> {
  readonly [$internal] = true;
  readonly resourceType = 'buffer';
  flags: GPUBufferUsageFlags = GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC;
  readonly dataType: TData;

  readonly #device: GPUDevice;
  #buffer: GPUBuffer | null = null;
  #ownBuffer: boolean;
  #destroyed = false;
  #internalBuffer: ArrayBuffer | undefined;

  get #hostBuffer(): ArrayBuffer {
    return (this.#internalBuffer ??= new ArrayBuffer(sizeOf(this.dataType)));
  }
  #mappedRange: ArrayBuffer | undefined;
  #initialCallback: BufferInitCallback<TData> | undefined;
  readonly #disallowedUsages: UsageLiteral[] | undefined;

  readonly initial: InferInput<TData> | undefined;

  usableAsUniform = false;
  usableAsStorage = false;
  usableAsVertex = false;
  usableAsIndex = false;
  usableAsIndirect = false;

  constructor(
    root: ExperimentalTgpuRoot,
    dataType: TData,
    initialOrBuffer?: BufferInitialData<TData> | GPUBuffer,
    disallowedUsages?: UsageLiteral[],
  ) {
    this.dataType = dataType;
    this.#disallowedUsages = disallowedUsages;
    this.#device = root.device;
    if (isGPUBuffer(initialOrBuffer)) {
      this.#ownBuffer = false;
      this.#buffer = initialOrBuffer;
    } else {
      this.#ownBuffer = true;
      if (typeof initialOrBuffer === 'function') {
        this.#initialCallback = initialOrBuffer as BufferInitCallback<TData>;
      } else {
        this.initial = initialOrBuffer;
      }
    }
  }

  get buffer() {
    if (this.#destroyed) {
      throw new Error('This buffer has been destroyed');
    }

    if (!this.#buffer) {
      this.#buffer = this.#device.createBuffer({
        size: sizeOf(this.dataType),
        usage: this.flags,
        mappedAtCreation: !!this.initial || !!this.#initialCallback,
        label: getName(this) ?? '<unnamed>',
      });

      if (this.initial || this.#initialCallback) {
        if (this.#initialCallback) {
          this.#initialCallback(this);
        } else if (this.initial) {
          writeToArrayBuffer(this.#getMappedRange(), this.dataType, this.initial);
        }
        this.#unmapBuffer();
      }
    }

    return this.#buffer;
  }

  get destroyed() {
    return this.#destroyed;
  }

  get arrayBuffer(): ArrayBuffer {
    const gpuBuffer = this.buffer;
    if (gpuBuffer.mapState === 'mapped') {
      return this.#getMappedRange();
    }

    return this.#hostBuffer;
  }

  #getMappedRange(): ArrayBuffer {
    if (!this.#buffer || this.#buffer.mapState !== 'mapped') {
      throw new Error('Buffer is not mapped.');
    }

    this.#mappedRange ??= this.#buffer.getMappedRange();
    return this.#mappedRange;
  }

  #unmapBuffer(): void {
    if (!this.#buffer || this.#buffer.mapState !== 'mapped') {
      return;
    }

    this.#mappedRange = undefined;
    this.#buffer.unmap();
  }

  $name(label: string) {
    setName(this, label);
    if (this.#buffer) {
      this.#buffer.label = label;
    }
    return this;
  }

  $usage<T extends UsageLiteral[]>(
    ...usages: T
  ): this & UnionToIntersection<LiteralToUsageType<T[number]>> {
    for (const usage of usages) {
      if (this.#disallowedUsages?.includes(usage)) {
        throw new Error(`Buffer of type ${this.dataType.type} cannot be used as ${usage}`);
      }

      this.flags |= usage === 'uniform' ? GPUBufferUsage.UNIFORM : 0;
      this.flags |= usage === 'storage' ? GPUBufferUsage.STORAGE : 0;
      this.flags |= usage === 'vertex' ? GPUBufferUsage.VERTEX : 0;
      this.flags |= usage === 'index' ? GPUBufferUsage.INDEX : 0;
      this.flags |= usage === 'indirect' ? GPUBufferUsage.INDIRECT : 0;
      this.usableAsUniform = this.usableAsUniform || usage === 'uniform';
      this.usableAsStorage = this.usableAsStorage || usage === 'storage';
      this.usableAsVertex = this.usableAsVertex || usage === 'vertex';
      this.usableAsIndex = this.usableAsIndex || usage === 'index';
      this.usableAsIndirect = this.usableAsIndirect || usage === 'indirect';
    }
    return this as this & UnionToIntersection<LiteralToUsageType<T[number]>>;
  }

  $addFlags(flags: GPUBufferUsageFlags) {
    if (!this.#ownBuffer) {
      throw new Error('Cannot add flags to a buffer that is not managed by TypeGPU.');
    }

    if (flags & GPUBufferUsage.MAP_READ) {
      this.flags = GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ;
      return this;
    }

    if (flags & GPUBufferUsage.MAP_WRITE) {
      this.flags = GPUBufferUsage.COPY_SRC | GPUBufferUsage.MAP_WRITE;
      return this;
    }

    this.flags |= flags;
    return this;
  }

  compileWriter(): void {
    getCompiledWriter(this.dataType);
  }

  write(data: InferInput<TData>, options?: BufferWriteOptions): void;
  write(data: ArrayBuffer, options?: BufferWriteOptions): void;
  write(data: InferInput<TData> | ArrayBuffer, options?: BufferWriteOptions): void {
    const gpuBuffer = this.buffer;
    const bufferSize = sizeOf(this.dataType);
    const startOffset = options?.startOffset ?? 0;

    let naturalSize: number | undefined = undefined;
    if (isWgslArray(this.dataType) && Array.isArray(data)) {
      const arrayData = data as unknown[];
      naturalSize =
        arrayData.length *
        roundUp(sizeOf(this.dataType.elementType), alignmentOf(this.dataType.elementType));
    } else if (ArrayBuffer.isView(data) || data instanceof ArrayBuffer) {
      naturalSize = data.byteLength;
    }
    const naturalEndOffset =
      naturalSize !== undefined ? Math.min(startOffset + naturalSize, bufferSize) : undefined;

    const endOffset = options?.endOffset ?? naturalEndOffset ?? bufferSize;
    const size = endOffset - startOffset;

    if (gpuBuffer.mapState === 'mapped') {
      const mapped = this.#getMappedRange();
      if (data instanceof ArrayBuffer && data === mapped) {
        // The caller already wrote data directly into the mapped range
        // via arrayBuffer. Nothing to do here
        return;
      }
      writeToArrayBuffer(mapped, this.dataType, data, options);
      return;
    }

    // If the caller already wrote directly into #hostBuffer via
    // arrayBuffer, skip the redundant copy, the data is already in place.
    if (!(data instanceof ArrayBuffer && data === this.#hostBuffer)) {
      writeToArrayBuffer(this.#hostBuffer, this.dataType, data, options);
    }
    this.#device.queue.writeBuffer(gpuBuffer, startOffset, this.#hostBuffer, startOffset, size);
  }

  /** @deprecated Use {@link patch} instead. */
  public writePartial(data: InferPartial<TData>): void {
    this.patch(convertPartialToPatch(this.dataType, data) as InferPatch<TData>);
  }

  public patch(data: InferPatch<TData>): void {
    const gpuBuffer = this.buffer;

    if (gpuBuffer.mapState === 'mapped') {
      patchArrayBuffer(this.#getMappedRange(), this.dataType, data);
    } else {
      const instructions = getPatchInstructions(this.dataType, data, this.#hostBuffer);
      for (const { data, gpuOffset } of instructions) {
        this.#device.queue.writeBuffer(gpuBuffer, gpuOffset, data);
      }
    }
  }

  public clear(): void {
    const gpuBuffer = this.buffer;

    if (gpuBuffer.mapState === 'mapped') {
      new Uint8Array(this.#getMappedRange()).fill(0);
      return;
    }

    const encoder = this.#device.createCommandEncoder();
    encoder.clearBuffer(gpuBuffer);
    this.#device.queue.submit([encoder.finish()]);
  }

  copyFrom(srcBuffer: TgpuBuffer<MemIdentity<TData>>): void {
    if (this.buffer.mapState === 'mapped') {
      throw new Error('Cannot copy to a mapped buffer.');
    }

    const size = sizeOf(this.dataType);
    const encoder = this.#device.createCommandEncoder();
    encoder.copyBufferToBuffer(srcBuffer.buffer, 0, this.buffer, 0, size);
    this.#device.queue.submit([encoder.finish()]);
  }

  async read(): Promise<Infer<TData>> {
    const gpuBuffer = this.buffer;

    if (gpuBuffer.mapState === 'mapped') {
      return readFromArrayBuffer(this.#getMappedRange(), this.dataType);
    }

    if (gpuBuffer.usage & GPUBufferUsage.MAP_READ) {
      await gpuBuffer.mapAsync(GPUMapMode.READ);
      const res = readFromArrayBuffer(this.#getMappedRange(), this.dataType);
      this.#unmapBuffer();
      return res;
    }

    const stagingBuffer = this.#device.createBuffer({
      size: sizeOf(this.dataType),
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    });

    const commandEncoder = this.#device.createCommandEncoder();
    commandEncoder.copyBufferToBuffer(gpuBuffer, 0, stagingBuffer, 0, sizeOf(this.dataType));

    this.#device.queue.submit([commandEncoder.finish()]);
    await stagingBuffer.mapAsync(GPUMapMode.READ, 0, sizeOf(this.dataType));

    const res = readFromArrayBuffer(stagingBuffer.getMappedRange(), this.dataType);

    stagingBuffer.unmap();
    stagingBuffer.destroy();

    return res;
  }

  as<T extends ViewUsages<this>>(usage: T): UsageTypeToBufferUsage<TData>[T] {
    return usageToUsageConstructor[usage]?.(this as never) as UsageTypeToBufferUsage<TData>[T];
  }

  destroy() {
    if (this.#destroyed) {
      return;
    }
    this.#destroyed = true;
    this.#mappedRange = undefined;
    if (this.#ownBuffer) {
      this.#buffer?.destroy();
    }
  }

  toString(): string {
    return `buffer:${getName(this) ?? '<unnamed>'}`;
  }
}
