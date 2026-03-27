import { BufferReader, BufferWriter, getSystemEndianness } from 'typed-binary';
import { getCompiledWriterForSchema } from '../../data/compiledIO.ts';
import { readData, writeData } from '../../data/dataIO.ts';
import type { AnyData } from '../../data/dataTypes.ts';
import { getWriteInstructions } from '../../data/partialIO.ts';
import { sizeOf } from '../../data/sizeOf.ts';
import type { BaseData } from '../../data/wgslTypes.ts';
import { isWgslArray, isWgslData } from '../../data/wgslTypes.ts';
import type { StorageFlag } from '../../extension.ts';
import type { TgpuNamable } from '../../shared/meta.ts';
import { getName, setName } from '../../shared/meta.ts';
import type {
  Infer,
  InferInput,
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

export interface TgpuBuffer<TData extends BaseData> extends TgpuNamable {
  readonly [$internal]: true;
  readonly resourceType: 'buffer';
  readonly dataType: TData;
  readonly initial?: InferInput<TData> | undefined;

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
  writePartial(data: InferPartial<TData>): void;
  clear(): void;
  copyFrom(srcBuffer: TgpuBuffer<MemIdentity<TData>>): void;
  read(): Promise<Infer<TData>>;
  destroy(): void;
  toString(): string;
}

export function INTERNAL_createBuffer<TData extends AnyData>(
  group: ExperimentalTgpuRoot,
  typeSchema: TData,
  initialOrBuffer?: InferInput<TData> | GPUBuffer,
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
const endianness = getSystemEndianness();

class TgpuBufferImpl<TData extends BaseData> implements TgpuBuffer<TData> {
  public readonly [$internal] = true;
  public readonly resourceType = 'buffer';
  public flags: GPUBufferUsageFlags = GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC;

  readonly #device: GPUDevice;
  private _buffer: GPUBuffer | null = null;
  private _ownBuffer: boolean;
  private _destroyed = false;
  private _hostBuffer: ArrayBuffer | undefined;

  readonly initial: InferInput<TData> | undefined;

  usableAsUniform = false;
  usableAsStorage = false;
  usableAsVertex = false;
  usableAsIndex = false;
  usableAsIndirect = false;

  constructor(
    root: ExperimentalTgpuRoot,
    public readonly dataType: TData,
    public readonly initialOrBuffer?: InferInput<TData> | GPUBuffer,
    private readonly _disallowedUsages?: UsageLiteral[],
  ) {
    this.#device = root.device;
    if (isGPUBuffer(initialOrBuffer)) {
      this._ownBuffer = false;
      this._buffer = initialOrBuffer;
    } else {
      this._ownBuffer = true;
      this.initial = initialOrBuffer;
    }
  }

  get buffer() {
    if (this._destroyed) {
      throw new Error('This buffer has been destroyed');
    }

    if (!this._buffer) {
      this._buffer = this.#device.createBuffer({
        size: sizeOf(this.dataType),
        usage: this.flags,
        mappedAtCreation: !!this.initial,
        label: getName(this) ?? '<unnamed>',
      });

      if (this.initial) {
        this._writeToTarget(this._buffer.getMappedRange(), this.initial);
        this._buffer.unmap();
      }
    }

    return this._buffer;
  }

  get destroyed() {
    return this._destroyed;
  }

  $name(label: string) {
    setName(this, label);
    if (this._buffer) {
      this._buffer.label = label;
    }
    return this;
  }

  $usage<T extends UsageLiteral[]>(
    ...usages: T
  ): this & UnionToIntersection<LiteralToUsageType<T[number]>> {
    for (const usage of usages) {
      if (this._disallowedUsages?.includes(usage)) {
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
    if (!this._ownBuffer) {
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
    getCompiledWriterForSchema(this.dataType);
  }

  private _writeToTarget(
    target: ArrayBuffer,
    data: InferInput<TData> | ArrayBuffer,
    options?: BufferWriteOptions,
  ): void {
    const startOffset = options?.startOffset ?? 0;
    const endOffset = options?.endOffset ?? target.byteLength;

    // Fast path: raw byte copy, user guarantees the padded layout
    if (data instanceof ArrayBuffer || ArrayBuffer.isView(data)) {
      const src =
        data instanceof ArrayBuffer
          ? new Uint8Array(data)
          : new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
      const regionSize = endOffset - startOffset;
      if (src.byteLength !== regionSize) {
        console.warn(
          `Buffer size mismatch: expected ${regionSize} bytes, got ${src.byteLength}. ` +
            (src.byteLength < regionSize ? 'Data truncated.' : 'Excess ignored.'),
        );
      }
      const copyLen = Math.min(src.byteLength, regionSize);
      new Uint8Array(target).set(src.subarray(0, copyLen), startOffset);
      return;
    }

    const dataView = new DataView(target);
    const isLittleEndian = endianness === 'little';

    const compiledWriter = getCompiledWriterForSchema(this.dataType);

    if (compiledWriter) {
      try {
        compiledWriter(dataView, startOffset, data, isLittleEndian, endOffset);
        return;
      } catch (error) {
        console.error(
          `Error when using compiled writer for buffer ${
            getName(this) ?? '<unnamed>'
          } - this is likely a bug, please submit an issue at https://github.com/software-mansion/TypeGPU/issues\nUsing fallback writer instead.`,
          error,
        );
      }
    }

    const writer = new BufferWriter(target);
    writer.seekTo(startOffset);
    writeData(writer, this.dataType, data as Infer<TData>);
  }

  write(data: InferInput<TData>, options?: BufferWriteOptions): void;
  write(data: ArrayBuffer, options?: BufferWriteOptions): void;
  write(data: InferInput<TData> | ArrayBuffer, options?: BufferWriteOptions): void {
    const gpuBuffer = this.buffer;
    const bufferSize = sizeOf(this.dataType);
    const startOffset = options?.startOffset ?? 0;

    const naturalSize =
      isWgslArray(this.dataType) && Array.isArray(data)
        ? data.length *
          roundUp(sizeOf(this.dataType.elementType), alignmentOf(this.dataType.elementType))
        : ArrayBuffer.isView(data) || data instanceof ArrayBuffer
          ? data.byteLength
          : undefined;
    const naturalEndOffset =
      naturalSize !== undefined ? Math.min(startOffset + naturalSize, bufferSize) : undefined;

    const endOffset = options?.endOffset ?? naturalEndOffset ?? bufferSize;
    const size = endOffset - startOffset;

    if (gpuBuffer.mapState === 'mapped') {
      const mapped = gpuBuffer.getMappedRange();
      this._writeToTarget(mapped, data, options);
      return;
    }

    if (!this._hostBuffer) {
      this._hostBuffer = new ArrayBuffer(bufferSize);
    }

    this._writeToTarget(this._hostBuffer, data, options);
    this.#device.queue.writeBuffer(gpuBuffer, startOffset, this._hostBuffer, startOffset, size);
  }

  public writePartial(data: InferPartial<TData>): void {
    const gpuBuffer = this.buffer;

    const instructions = getWriteInstructions(this.dataType, data);

    if (gpuBuffer.mapState === 'mapped') {
      const mappedRange = gpuBuffer.getMappedRange();
      const mappedView = new Uint8Array(mappedRange);

      for (const instruction of instructions) {
        mappedView.set(instruction.data, instruction.data.byteOffset);
      }
    } else {
      for (const instruction of instructions) {
        this.#device.queue.writeBuffer(
          gpuBuffer,
          instruction.data.byteOffset,
          instruction.data,
          0,
          instruction.data.byteLength,
        );
      }
    }
  }

  public clear(): void {
    const gpuBuffer = this.buffer;

    if (gpuBuffer.mapState === 'mapped') {
      new Uint8Array(gpuBuffer.getMappedRange()).fill(0);
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
      const mapped = gpuBuffer.getMappedRange();
      return readData(new BufferReader(mapped), this.dataType);
    }

    if (gpuBuffer.usage & GPUBufferUsage.MAP_READ) {
      await gpuBuffer.mapAsync(GPUMapMode.READ);
      const mapped = gpuBuffer.getMappedRange();
      const res = readData(new BufferReader(mapped), this.dataType);
      gpuBuffer.unmap();
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

    const res = readData(new BufferReader(stagingBuffer.getMappedRange()), this.dataType);

    stagingBuffer.unmap();
    stagingBuffer.destroy();

    return res;
  }

  as<T extends ViewUsages<this>>(usage: T): UsageTypeToBufferUsage<TData>[T] {
    return usageToUsageConstructor[usage]?.(this as never) as UsageTypeToBufferUsage<TData>[T];
  }

  destroy() {
    if (this._destroyed) {
      return;
    }
    this._destroyed = true;
    if (this._ownBuffer) {
      this._buffer?.destroy();
    }
  }

  toString(): string {
    return `buffer:${getName(this) ?? '<unnamed>'}`;
  }
}
