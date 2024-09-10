import { BufferWriter, type Parsed } from 'typed-binary';
import type { TgpuNamable } from './namable';
import type { TgpuPlum } from './tgpuPlumTypes';
import { type AnyTgpuData, type TgpuAllocatable, isGPUBuffer } from './types';

// ----------
// Public API
// ----------

export interface Unmanaged {
  readonly device: GPUDevice;
  readonly buffer: GPUBuffer;
}

export interface Uniform {
  usableAsUniform: true;
}

export interface Storage {
  usableAsStorage: true;
}

export interface Vertex {
  usableAsVertex: true;
}

export const Uniform = { usableAsUniform: true } as Uniform;
export const Storage = { usableAsStorage: true } as Storage;
export const Vertex = { usableAsVertex: true } as Vertex;

type UnionToIntersection<U> =
  // biome-ignore lint/suspicious/noExplicitAny: <had to be done>
  (U extends any ? (x: U) => void : never) extends (x: infer I) => void
    ? I
    : never;

export interface TgpuBuffer<TData extends AnyTgpuData>
  extends TgpuAllocatable<TData>,
    TgpuNamable {
  readonly destroyed: boolean;
  readonly label: string | undefined;

  $usage<T extends (Uniform | Storage | Vertex)[]>(
    ...usages: T
  ): this & UnionToIntersection<T[number]>;
  $addFlags(flags: GPUBufferUsageFlags): this;
  $device(device: GPUDevice): this & Unmanaged;

  destroy(): void;
}

export function createBuffer<TData extends AnyTgpuData>(
  typeSchema: TData,
  initial?: Parsed<TData> | TgpuPlum<Parsed<TData>> | undefined,
): TgpuBuffer<TData>;

export function createBuffer<TData extends AnyTgpuData>(
  typeSchema: TData,
  gpuBuffer: GPUBuffer,
): TgpuBuffer<TData>;

export function createBuffer<TData extends AnyTgpuData>(
  typeSchema: TData,
  initialOrBuffer?: Parsed<TData> | TgpuPlum<Parsed<TData>> | GPUBuffer,
): TgpuBuffer<TData> {
  return new TgpuBufferImpl(typeSchema, initialOrBuffer);
}

export function isUsableAsUniform<T extends TgpuBuffer<AnyTgpuData>>(
  buffer: T,
): buffer is T & Uniform {
  return !!(buffer as unknown as Uniform).usableAsUniform;
}

export function isUsableAsStorage<T extends TgpuBuffer<AnyTgpuData>>(
  buffer: T,
): buffer is T & Storage {
  return !!(buffer as unknown as Storage).usableAsStorage;
}

export function isUsableAsVertex<T extends TgpuBuffer<AnyTgpuData>>(
  buffer: T,
): buffer is T & Vertex {
  return !!(buffer as unknown as Vertex).usableAsVertex;
}

// --------------
// Implementation
// --------------

class TgpuBufferImpl<TData extends AnyTgpuData> implements TgpuBuffer<TData> {
  public flags: GPUBufferUsageFlags =
    GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC;
  private _device: GPUDevice | null = null;
  private _buffer: GPUBuffer | null = null;
  private _destroyed = false;

  private _label: string | undefined;
  readonly initial: Parsed<TData> | TgpuPlum<Parsed<TData>> | undefined;

  public usableAsUniform = false;
  public usableAsStorage = false;
  public usableAsVertex = false;

  constructor(
    public readonly dataType: TData,
    public readonly initialOrBuffer?:
      | Parsed<TData>
      | TgpuPlum<Parsed<TData>>
      | GPUBuffer
      | undefined,
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
        'To use this property, make the buffer unmanaged by passing a GPUDevice to $device',
      );
    }
    if (this._destroyed) {
      throw new Error('This buffer has been destroyed');
    }
    if (!this._buffer) {
      this._buffer = this._device.createBuffer({
        size: this.dataType.size,
        usage: this.flags,
        mappedAtCreation: !!this.initial,
      });
      if (this.initial) {
        const writer = new BufferWriter(this._buffer.getMappedRange());
        this.dataType.write(writer, this.initial);
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
    return this;
  }

  $usage<T extends (Uniform | Storage | Vertex)[]>(
    ...usages: T
  ): this & UnionToIntersection<T[number]> {
    for (const usage of usages) {
      this.flags |= usage === Uniform ? GPUBufferUsage.UNIFORM : 0;
      this.flags |= usage === Storage ? GPUBufferUsage.STORAGE : 0;
      this.flags |= usage === Vertex ? GPUBufferUsage.VERTEX : 0;
      this.usableAsUniform = this.usableAsUniform || usage === Uniform;
      this.usableAsStorage = this.usableAsStorage || usage === Storage;
      this.usableAsVertex = this.usableAsVertex || usage === Vertex;
    }
    return this as this & UnionToIntersection<T[number]>;
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
