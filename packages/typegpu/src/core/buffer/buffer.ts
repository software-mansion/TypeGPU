import { BufferReader, BufferWriter } from 'typed-binary';
import { isWgslData } from '../../data';
import { readData, writeData } from '../../data/dataIO';
import type { AnyData } from '../../data/dataTypes';
import { getWriteInstructions } from '../../data/partialIO';
import { sizeOf } from '../../data/sizeOf';
import type { BaseData, WgslTypeLiteral } from '../../data/wgslTypes';
import type { StorageFlag } from '../../extension';
import type { TgpuNamable } from '../../namable';
import type { Infer, InferPartial } from '../../shared/repr';
import type { MemIdentity } from '../../shared/repr';
import type { UnionToIntersection } from '../../shared/utilityTypes';
import { isGPUBuffer } from '../../types';
import type { ExperimentalTgpuRoot } from '../root/rootTypes';
import {
  type TgpuBufferMutable,
  type TgpuBufferReadonly,
  type TgpuBufferUniform,
  type TgpuFixedBufferUsage,
  asMutable,
  asReadonly,
  asUniform,
} from './bufferUsage';

// ----------
// Public API
// ----------

export interface Uniform {
  usableAsUniform: true;
}

export interface Vertex {
  usableAsVertex: true;
}

type LiteralToUsageType<T extends 'uniform' | 'storage' | 'vertex'> =
  T extends 'uniform'
    ? Uniform
    : T extends 'storage'
      ? StorageFlag
      : T extends 'vertex'
        ? Vertex
        : never;

type ViewUsages<TBuffer extends TgpuBuffer<BaseData>> =
  | (boolean extends TBuffer['usableAsUniform'] ? never : 'uniform')
  | (boolean extends TBuffer['usableAsStorage']
      ? never
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

export interface TgpuBuffer<TData extends BaseData> extends TgpuNamable {
  readonly resourceType: 'buffer';
  readonly dataType: TData;
  readonly initial?: Infer<TData> | undefined;
  readonly label: string | undefined;

  readonly buffer: GPUBuffer;
  readonly destroyed: boolean;

  usableAsUniform: boolean;
  usableAsStorage: boolean;
  usableAsVertex: boolean;

  $usage<T extends RestrictVertexUsages<TData>>(
    ...usages: T
  ): this & UnionToIntersection<LiteralToUsageType<T[number]>>;
  $addFlags(flags: GPUBufferUsageFlags): this;

  as<T extends ViewUsages<this>>(usage: T): UsageTypeToBufferUsage<TData>[T];

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
): buffer is T & Vertex {
  return !!(buffer as unknown as Vertex).usableAsVertex;
}

// --------------
// Implementation
// --------------

type RestrictVertexUsages<TData extends BaseData> = TData extends {
  readonly type: WgslTypeLiteral;
}
  ? ('uniform' | 'storage' | 'vertex')[]
  : 'vertex'[];

class TgpuBufferImpl<TData extends AnyData> implements TgpuBuffer<TData> {
  public readonly resourceType = 'buffer';
  public flags: GPUBufferUsageFlags =
    GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC;
  private _buffer: GPUBuffer | null = null;
  private _ownBuffer: boolean;
  private _destroyed = false;

  private _label: string | undefined;
  readonly initial: Infer<TData> | undefined;

  usableAsUniform = false;
  usableAsStorage = false;
  usableAsVertex = false;

  constructor(
    private readonly _group: ExperimentalTgpuRoot,
    public readonly dataType: TData,
    public readonly initialOrBuffer?: Infer<TData> | GPUBuffer | undefined,
    private readonly _disallowedUsages?: ('uniform' | 'storage' | 'vertex')[],
  ) {
    if (isGPUBuffer(initialOrBuffer)) {
      this._ownBuffer = false;
      this._buffer = initialOrBuffer;
    } else {
      this._ownBuffer = true;
      this.initial = initialOrBuffer;
    }
  }

  get label() {
    return this._label;
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
        label: this.label ?? '<unnamed>',
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
    this._label = label;
    if (this._buffer) {
      this._buffer.label = label;
    }
    return this;
  }

  $usage<T extends RestrictVertexUsages<TData>>(
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
      this.usableAsUniform = this.usableAsUniform || usage === 'uniform';
      this.usableAsStorage = this.usableAsStorage || usage === 'storage';
      this.usableAsVertex = this.usableAsVertex || usage === 'vertex';
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

  write(data: Infer<TData>): void {
    const gpuBuffer = this.buffer;
    const device = this._group.device;

    if (gpuBuffer.mapState === 'mapped') {
      const mapped = gpuBuffer.getMappedRange();
      writeData(new BufferWriter(mapped), this.dataType, data);
      return;
    }

    const size = sizeOf(this.dataType);

    // Flushing any commands yet to be encoded.
    this._group.flush();

    const hostBuffer = new ArrayBuffer(size);
    writeData(new BufferWriter(hostBuffer), this.dataType, data);
    device.queue.writeBuffer(gpuBuffer, 0, hostBuffer, 0, size);
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
    return `buffer:${this._label ?? '<unnamed>'}`;
  }
}
