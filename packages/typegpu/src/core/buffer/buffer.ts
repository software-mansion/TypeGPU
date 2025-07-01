import { BufferReader, BufferWriter, getSystemEndianness } from 'typed-binary';
import {
  EVAL_ALLOWED_IN_ENV,
  getCompiledWriterForSchema,
} from '../../data/compiledIO.ts';
import { readData, writeData } from '../../data/dataIO.ts';
import { getWriteInstructions } from '../../data/partialIO.ts';
import { sizeOf } from '../../data/sizeOf.ts';
import type { BaseData, WgslTypeLiteral } from '../../data/wgslTypes.ts';
import { isWgslData } from '../../data/wgslTypes.ts';
import type { StorageFlag } from '../../extension.ts';
import type { TgpuNamable } from '../../shared/meta.ts';
import { getName, setName } from '../../shared/meta.ts';
import type { Infer, InferPartial, MemIdentity } from '../../shared/repr.ts';
import { $internal } from '../../shared/symbols.ts';
import type { UnionToIntersection } from '../../shared/utilityTypes.ts';
import { isGPUBuffer } from '../../types.ts';
import type { ExperimentalTgpuRoot } from '../root/rootTypes.ts';
import {
  asMutable,
  asReadonly,
  asUniform,
  type TgpuBufferMutable,
  type TgpuBufferReadonly,
  type TgpuBufferUniform,
  type TgpuFixedBufferUsage,
} from './bufferUsage.ts';
import type { AnyData, UnwrapDecorated } from '../../data/dataTypes.ts';

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

/**
 * @deprecated Use VertexFlag instead.
 */
export type Vertex = VertexFlag;

type LiteralToUsageType<T extends 'uniform' | 'storage' | 'vertex' | 'index'> =
  T extends 'uniform' ? UniformFlag
    : T extends 'storage' ? StorageFlag
    : T extends 'vertex' ? VertexFlag
    : T extends 'index' ? IndexFlag
    : never;

type ViewUsages<TBuffer extends TgpuBuffer<BaseData>> =
  | (boolean extends TBuffer['usableAsUniform'] ? never : 'uniform')
  | (boolean extends TBuffer['usableAsStorage'] ? never
    : 'readonly' | 'mutable');

type UsageTypeToBufferUsage<TData extends BaseData> = {
  uniform: TgpuBufferUniform<TData> & TgpuFixedBufferUsage<TData>;
  mutable: TgpuBufferMutable<TData> & TgpuFixedBufferUsage<TData>;
  readonly: TgpuBufferReadonly<TData> & TgpuFixedBufferUsage<TData>;
};

const usageToUsageConstructor = {
  uniform: asUniform,
  mutable: asMutable,
  readonly: asReadonly,
};

type IsIndexCompatible<TData extends BaseData> = UnwrapDecorated<TData> extends
  {
    readonly type: 'array';
    readonly elementType: infer TElement;
  }
  ? TElement extends BaseData
    ? UnwrapDecorated<TElement> extends { readonly type: 'u32' | 'u16' } ? true
    : false
  : false
  : false;

export interface TgpuBuffer<TData extends BaseData> extends TgpuNamable {
  readonly [$internal]: true;
  readonly resourceType: 'buffer';
  readonly dataType: TData;
  readonly initial?: Infer<TData> | undefined;

  readonly buffer: GPUBuffer;
  readonly destroyed: boolean;

  usableAsUniform: boolean;
  usableAsStorage: boolean;
  usableAsVertex: boolean;
  usableAsIndex: boolean;

  $usage<T extends RestrictUsages<TData>>(
    ...usages: T
  ): this & UnionToIntersection<LiteralToUsageType<T[number]>>;
  $addFlags(flags: GPUBufferUsageFlags): this;

  as<T extends ViewUsages<this>>(usage: T): UsageTypeToBufferUsage<TData>[T];

  compileWriter(): void;
  write(data: Infer<TData>): void;
  writePartial(data: InferPartial<TData>): void;
  copyFrom(srcBuffer: TgpuBuffer<MemIdentity<TData>>): void;
  read(): Promise<Infer<TData>>;
  destroy(): void;
}

export function INTERNAL_createBuffer<TData extends AnyData>(
  group: ExperimentalTgpuRoot,
  typeSchema: TData,
  initialOrBuffer?: Infer<TData> | GPUBuffer,
): TgpuBuffer<TData> {
  if (!isWgslData(typeSchema)) {
    return new TgpuBufferImpl(group, typeSchema, initialOrBuffer, [
      'storage',
      'uniform',
    ]);
  }

  return new TgpuBufferImpl(group, typeSchema, initialOrBuffer);
}

export function isBuffer<T extends TgpuBuffer<AnyData>>(
  value: T | unknown,
): value is T {
  return (value as TgpuBuffer<AnyData>).resourceType === 'buffer';
}

export function isUsableAsVertex<T extends TgpuBuffer<AnyData>>(
  buffer: T,
): buffer is T & VertexFlag {
  return !!(buffer as unknown as VertexFlag).usableAsVertex;
}

export function isUsableAsIndex<T extends TgpuBuffer<AnyData>>(
  buffer: T,
): buffer is T & IndexFlag {
  return !!(buffer as unknown as IndexFlag).usableAsIndex;
}

// --------------
// Implementation
// --------------
const endianness = getSystemEndianness();

type IsArrayOfU32<TData extends BaseData> = UnwrapDecorated<TData> extends {
  readonly type: 'array';
  readonly elementType: infer TElement;
}
  ? TElement extends BaseData
    ? UnwrapDecorated<TElement> extends { readonly type: 'u32' } ? true
    : false
  : false
  : false;

type IsWgslLiteral<TData extends BaseData> = TData extends {
  readonly type: WgslTypeLiteral;
} ? true
  : false;

type RestrictUsages<TData extends BaseData> = string extends TData['type']
  ? ('uniform' | 'storage' | 'vertex' | 'index')[]
  : IsIndexCompatible<TData> extends true
    ? IsArrayOfU32<TData> extends true
      ? ('uniform' | 'storage' | 'vertex' | 'index')[]
    : ['index']
  : IsWgslLiteral<TData> extends true ? ('uniform' | 'storage' | 'vertex')[]
  : ['vertex'];

class TgpuBufferImpl<TData extends AnyData> implements TgpuBuffer<TData> {
  public readonly [$internal] = true;
  public readonly resourceType = 'buffer';
  public flags: GPUBufferUsageFlags = GPUBufferUsage.COPY_DST |
    GPUBufferUsage.COPY_SRC;
  private _buffer: GPUBuffer | null = null;
  private _ownBuffer: boolean;
  private _destroyed = false;
  private _hostBuffer: ArrayBuffer | undefined;

  readonly initial: Infer<TData> | undefined;

  usableAsUniform = false;
  usableAsStorage = false;
  usableAsVertex = false;
  usableAsIndex = false;

  constructor(
    private readonly _group: ExperimentalTgpuRoot,
    public readonly dataType: TData,
    public readonly initialOrBuffer?: Infer<TData> | GPUBuffer | undefined,
    private readonly _disallowedUsages?:
      ('uniform' | 'storage' | 'vertex' | 'index')[],
  ) {
    if (isGPUBuffer(initialOrBuffer)) {
      this._ownBuffer = false;
      this._buffer = initialOrBuffer;
    } else {
      this._ownBuffer = true;
      this.initial = initialOrBuffer;
    }
  }

  get buffer() {
    const device = this._group.device;

    if (this._destroyed) {
      throw new Error('This buffer has been destroyed');
    }

    if (!this._buffer) {
      this._buffer = device.createBuffer({
        size: sizeOf(this.dataType),
        usage: this.flags,
        mappedAtCreation: !!this.initial,
        label: getName(this) ?? '<unnamed>',
      });

      if (this.initial) {
        const writer = new BufferWriter(this._buffer.getMappedRange());
        writeData(writer, this.dataType, this.initial);
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

  $usage<T extends ('uniform' | 'storage' | 'vertex' | 'index')[]>(
    ...usages: T
  ): this & UnionToIntersection<LiteralToUsageType<T[number]>> {
    for (const usage of usages) {
      if (this._disallowedUsages?.includes(usage)) {
        throw new Error(
          `Buffer of type ${this.dataType.type} cannot be used as ${usage}`,
        );
      }

      this.flags |= usage === 'uniform' ? GPUBufferUsage.UNIFORM : 0;
      this.flags |= usage === 'storage' ? GPUBufferUsage.STORAGE : 0;
      this.flags |= usage === 'vertex' ? GPUBufferUsage.VERTEX : 0;
      this.flags |= usage === 'index' ? GPUBufferUsage.INDEX : 0;
      this.usableAsUniform = this.usableAsUniform || usage === 'uniform';
      this.usableAsStorage = this.usableAsStorage || usage === 'storage';
      this.usableAsVertex = this.usableAsVertex || usage === 'vertex';
      this.usableAsIndex = this.usableAsIndex || usage === 'index';
    }
    return this as this & UnionToIntersection<LiteralToUsageType<T[number]>>;
  }

  $addFlags(flags: GPUBufferUsageFlags) {
    if (!this._ownBuffer) {
      throw new Error(
        'Cannot add flags to a buffer that is not managed by TypeGPU.',
      );
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
    if (EVAL_ALLOWED_IN_ENV) {
      getCompiledWriterForSchema(this.dataType);
    } else {
      throw new Error('This environment does not allow eval');
    }
  }

  write(data: Infer<TData>): void {
    const gpuBuffer = this.buffer;
    const device = this._group.device;

    if (gpuBuffer.mapState === 'mapped') {
      const mapped = gpuBuffer.getMappedRange();
      if (EVAL_ALLOWED_IN_ENV) {
        const writer = getCompiledWriterForSchema(this.dataType);
        writer(new DataView(mapped), 0, data, endianness === 'little');
        return;
      }
      writeData(new BufferWriter(mapped), this.dataType, data);
      return;
    }

    const size = sizeOf(this.dataType);
    if (!this._hostBuffer) {
      this._hostBuffer = new ArrayBuffer(size);
    }

    // Flushing any commands yet to be encoded.
    this._group.flush();

    if (EVAL_ALLOWED_IN_ENV) {
      const writer = getCompiledWriterForSchema(this.dataType);
      writer(new DataView(this._hostBuffer), 0, data, endianness === 'little');
    } else {
      writeData(new BufferWriter(this._hostBuffer), this.dataType, data);
    }
    device.queue.writeBuffer(gpuBuffer, 0, this._hostBuffer, 0, size);
  }

  public writePartial(data: InferPartial<TData>): void {
    const gpuBuffer = this.buffer;
    const device = this._group.device;

    const instructions = getWriteInstructions(this.dataType, data);

    if (gpuBuffer.mapState === 'mapped') {
      const mappedRange = gpuBuffer.getMappedRange();
      const mappedView = new Uint8Array(mappedRange);

      for (const instruction of instructions) {
        mappedView.set(instruction.data, instruction.data.byteOffset);
      }
    } else {
      for (const instruction of instructions) {
        device.queue.writeBuffer(
          gpuBuffer,
          instruction.data.byteOffset,
          instruction.data,
          0,
          instruction.data.byteLength,
        );
      }
    }
  }

  copyFrom(srcBuffer: TgpuBuffer<MemIdentity<TData>>): void {
    if (this.buffer.mapState === 'mapped') {
      throw new Error('Cannot copy to a mapped buffer.');
    }

    const size = sizeOf(this.dataType);
    const encoder = this._group.commandEncoder;
    encoder.copyBufferToBuffer(srcBuffer.buffer, 0, this.buffer, 0, size);
  }

  async read(): Promise<Infer<TData>> {
    // Flushing any commands yet to be encoded.
    this._group.flush();

    const gpuBuffer = this.buffer;
    const device = this._group.device;

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

    const stagingBuffer = device.createBuffer({
      size: sizeOf(this.dataType),
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    });

    const commandEncoder = device.createCommandEncoder();
    commandEncoder.copyBufferToBuffer(
      gpuBuffer,
      0,
      stagingBuffer,
      0,
      sizeOf(this.dataType),
    );

    device.queue.submit([commandEncoder.finish()]);
    await device.queue.onSubmittedWorkDone();
    await stagingBuffer.mapAsync(GPUMapMode.READ, 0, sizeOf(this.dataType));

    const res = readData(
      new BufferReader(stagingBuffer.getMappedRange()),
      this.dataType,
    );

    stagingBuffer.unmap();
    stagingBuffer.destroy();

    return res;
  }

  as<T extends ViewUsages<this>>(usage: T): UsageTypeToBufferUsage<TData>[T] {
    return usageToUsageConstructor[usage]?.(
      this as never,
    ) as UsageTypeToBufferUsage<TData>[T];
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
