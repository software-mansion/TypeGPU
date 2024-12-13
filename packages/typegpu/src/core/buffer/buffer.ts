import { BufferReader, BufferWriter } from 'typed-binary';
import { readData, writeData } from '../../data/dataIO';
import type { AnyData } from '../../data/dataTypes';
import { sizeOf } from '../../data/sizeOf';
import type { Storage } from '../../extension';
import type { TgpuNamable } from '../../namable';
import type { Infer } from '../../shared/repr';
import type { UnionToIntersection } from '../../shared/utilityTypes';
import { isGPUBuffer } from '../../types';
import type { ExperimentalTgpuRoot } from '../root/rootTypes';

// ----------
// Public API
// ----------

export interface Uniform {
  usableAsUniform: true;
}

export interface Vertex {
  usableAsVertex: true;
}

export const Uniform = { usableAsUniform: true } as Uniform;
export const Vertex = { usableAsVertex: true } as Vertex;

type LiteralToUsageType<T extends 'uniform' | 'storage' | 'vertex'> =
  T extends 'uniform'
    ? Uniform
    : T extends 'storage'
      ? Storage
      : T extends 'vertex'
        ? Vertex
        : never;

export interface TgpuBuffer<TData extends AnyData> extends TgpuNamable {
  readonly resourceType: 'buffer';
  readonly dataType: TData;
  readonly initial?: Infer<TData> | undefined;
  readonly label: string | undefined;

  readonly buffer: GPUBuffer;
  readonly device: GPUDevice;
  readonly destroyed: boolean;

  $usage<T extends ('uniform' | 'storage' | 'vertex')[]>(
    ...usages: T
  ): this & UnionToIntersection<LiteralToUsageType<T[number]>>;
  $addFlags(flags: GPUBufferUsageFlags): this;
  $device(device: GPUDevice): this;

  write(data: Infer<TData> | TgpuBuffer<TData>): void;
  read(): Promise<Infer<TData>>;
  destroy(): void;
}

export function createBufferImpl<TData extends AnyData>(
  group: ExperimentalTgpuRoot | undefined,
  typeSchema: TData,
  initialOrBuffer?: Infer<TData> | GPUBuffer,
): TgpuBuffer<TData> {
  return new TgpuBufferImpl(group, typeSchema, initialOrBuffer);
}

export function isBuffer<T extends TgpuBuffer<AnyData>>(
  value: T | unknown,
): value is T {
  return (value as TgpuBuffer<AnyData>).resourceType === 'buffer';
}

export function isUsableAsUniform<T extends TgpuBuffer<AnyData>>(
  buffer: T,
): buffer is T & Uniform {
  return !!(buffer as unknown as Uniform).usableAsUniform;
}

export function isUsableAsVertex<T extends TgpuBuffer<AnyData>>(
  buffer: T,
): buffer is T & Vertex {
  return !!(buffer as unknown as Vertex).usableAsVertex;
}

// --------------
// Implementation
// --------------

class TgpuBufferImpl<TData extends AnyData> implements TgpuBuffer<TData> {
  public readonly resourceType = 'buffer';
  public flags: GPUBufferUsageFlags =
    GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC;
  private _device: GPUDevice | null = null;
  private _buffer: GPUBuffer | null = null;
  private _destroyed = false;

  private _label: string | undefined;
  readonly initial: Infer<TData> | undefined;

  public usableAsUniform = false;
  public usableAsStorage = false;
  public usableAsVertex = false;

  constructor(
    private readonly _group: ExperimentalTgpuRoot | undefined,
    public readonly dataType: TData,
    public readonly initialOrBuffer?: Infer<TData> | GPUBuffer | undefined,
  ) {
    if (isGPUBuffer(initialOrBuffer)) {
      this._buffer = initialOrBuffer;
    } else {
      this.initial = initialOrBuffer;
    }
  }

  get label() {
    return this._label;
  }

  get buffer() {
    if (!this._device) {
      throw new Error(
        'Create this buffer using `root.createBuffer` instead of `tgpu.createBuffer`.',
      );
    }

    if (this._destroyed) {
      throw new Error('This buffer has been destroyed');
    }

    if (!this._buffer) {
      this._buffer = this._device.createBuffer({
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

  get device() {
    if (!this._device) {
      throw new Error(
        'This buffer has not been assigned a device. Use .$device(device) to assign a device',
      );
    }
    return this._device;
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

  $usage<T extends ('uniform' | 'storage' | 'vertex')[]>(
    ...usages: T
  ): this & UnionToIntersection<LiteralToUsageType<T[number]>> {
    for (const usage of usages) {
      this.flags |= usage === 'uniform' ? GPUBufferUsage.UNIFORM : 0;
      this.flags |= usage === 'storage' ? GPUBufferUsage.STORAGE : 0;
      this.flags |= usage === 'vertex' ? GPUBufferUsage.VERTEX : 0;
      this.usableAsUniform = this.usableAsUniform || usage === 'uniform';
      this.usableAsStorage = this.usableAsStorage || usage === 'storage';
      this.usableAsVertex = this.usableAsVertex || usage === 'vertex';
    }
    return this as this & UnionToIntersection<LiteralToUsageType<T[number]>>;
  }

  // Temporary solution
  $addFlags(flags: GPUBufferUsageFlags) {
    this.flags |= flags;
    return this;
  }

  $device(device: GPUDevice) {
    this._device = device;
    return this;
  }

  write(dataOrBuffer: Infer<TData> | TgpuBuffer<TData>): void {
    const gpuBuffer = this.buffer;
    const device = this.device;

    if (gpuBuffer.mapState === 'mapped') {
      const mapped = gpuBuffer.getMappedRange();
      if (isBuffer(dataOrBuffer)) {
        throw new Error('Cannot copy to a mapped buffer.');
      }
      writeData(new BufferWriter(mapped), this.dataType, dataOrBuffer);
      return;
    }

    const size = sizeOf(this.dataType);
    if (isBuffer(dataOrBuffer)) {
      const sourceBuffer = dataOrBuffer.buffer;

      if (this._group) {
        const encoder = this._group.commandEncoder;
        encoder.copyBufferToBuffer(sourceBuffer, 0, gpuBuffer, 0, size);
      } else {
        const commandEncoder = device.createCommandEncoder();
        commandEncoder.copyBufferToBuffer(sourceBuffer, 0, gpuBuffer, 0, size);
        device.queue.submit([commandEncoder.finish()]);
      }
    } else {
      if (this._group) {
        // Flushing any commands yet to be encoded.
        this._group.flush();
      }

      const hostBuffer = new ArrayBuffer(size);
      writeData(new BufferWriter(hostBuffer), this.dataType, dataOrBuffer);
      device.queue.writeBuffer(gpuBuffer, 0, hostBuffer, 0, size);
    }
  }

  async read(): Promise<Infer<TData>> {
    if (this._group) {
      // Flushing any commands yet to be encoded.
      this._group.flush();
    }

    const gpuBuffer = this.buffer;
    const device = this.device;

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

  destroy() {
    if (this._destroyed) {
      return;
    }
    this._destroyed = true;
    this._buffer?.destroy();
  }

  toString(): string {
    return `buffer:${this._label ?? '<unnamed>'}`;
  }
}
