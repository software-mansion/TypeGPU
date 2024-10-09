import { BufferReader, BufferWriter, type Parsed } from 'typed-binary';
import type { TgpuNamable } from './namable';
import { type TgpuPlum, type Unsubscribe, isPlum } from './tgpuPlumTypes';
import type { TgpuRoot } from './tgpuRoot';
import { type AnyTgpuData, isGPUBuffer } from './types';

// ----------
// Public API
// ----------

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

export interface TgpuBuffer<TData extends AnyTgpuData> extends TgpuNamable {
  readonly resourceType: 'buffer';
  readonly dataType: TData;
  readonly initial?: Parsed<TData> | TgpuPlum<Parsed<TData>> | undefined;
  readonly label: string | undefined;

  readonly buffer: GPUBuffer;
  readonly device: GPUDevice;
  readonly destroyed: boolean;

  $usage<T extends (Uniform | Storage | Vertex)[]>(
    ...usages: T
  ): this & UnionToIntersection<T[number]>;
  $addFlags(flags: GPUBufferUsageFlags): this;
  $device(device: GPUDevice): this;

  write(data: Parsed<TData> | TgpuBuffer<TData>): void;
  read(): Promise<Parsed<TData>>;
  destroy(): void;
}

export function createBufferImpl<TData extends AnyTgpuData>(
  group: TgpuRoot | undefined,
  typeSchema: TData,
  initialOrBuffer?: Parsed<TData> | TgpuPlum<Parsed<TData>> | GPUBuffer,
): TgpuBuffer<TData> {
  return new TgpuBufferImpl(group, typeSchema, initialOrBuffer);
}

export function isBuffer<T extends TgpuBuffer<AnyTgpuData>>(
  value: T | unknown,
): value is T {
  return (value as TgpuBuffer<AnyTgpuData>).resourceType === 'buffer';
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
  public readonly resourceType = 'buffer';
  public flags: GPUBufferUsageFlags =
    GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC;
  private _device: GPUDevice | null = null;
  private _buffer: GPUBuffer | null = null;
  private _destroyed = false;
  private _subscription: Unsubscribe | null = null;

  private _label: string | undefined;
  readonly initial: Parsed<TData> | TgpuPlum<Parsed<TData>> | undefined;

  public usableAsUniform = false;
  public usableAsStorage = false;
  public usableAsVertex = false;

  constructor(
    private readonly _group: TgpuRoot | undefined,
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
        'Create this buffer using `root.createBuffer` instead of `tgpu.createBuffer`.',
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

        if (isPlum(this.initial)) {
          const group = this._group;

          if (!group) {
            throw new Error(
              'Create this buffer using `root.createBuffer` instead of `tgpu.createBuffer`.',
            );
          }

          const plum = this.initial;

          this.dataType.write(writer, group.readPlum(plum));

          this._subscription = group.onPlumChange(plum, () => {
            this.write(group.readPlum(plum));
          });
        } else {
          this.dataType.write(writer, this.initial);
        }

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

  write(dataOrBuffer: Parsed<TData> | TgpuBuffer<TData>): void {
    const gpuBuffer = this.buffer;
    const device = this.device;

    if (gpuBuffer.mapState === 'mapped') {
      const mapped = gpuBuffer.getMappedRange();
      if (isBuffer(dataOrBuffer)) {
        throw new Error('Cannot copy to a mapped buffer.');
      }
      this.dataType.write(new BufferWriter(mapped), dataOrBuffer);
      return;
    }

    const size = this.dataType.size;
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
      this.dataType.write(new BufferWriter(hostBuffer), dataOrBuffer);
      device.queue.writeBuffer(gpuBuffer, 0, hostBuffer, 0, size);
    }
  }

  async read(): Promise<Parsed<TData>> {
    if (this._group) {
      // Flushing any commands yet to be encoded.
      this._group.flush();
    }

    const gpuBuffer = this.buffer;
    const device = this.device;

    if (gpuBuffer.mapState === 'mapped') {
      const mapped = gpuBuffer.getMappedRange();
      const res = this.dataType.read(new BufferReader(mapped)) as Parsed<TData>;
      return res;
    }

    if (gpuBuffer.usage & GPUBufferUsage.MAP_READ) {
      await gpuBuffer.mapAsync(GPUMapMode.READ);
      const mapped = gpuBuffer.getMappedRange();
      const res = this.dataType.read(new BufferReader(mapped)) as Parsed<TData>;
      gpuBuffer.unmap();
      return res;
    }

    const stagingBuffer = device.createBuffer({
      size: this.dataType.size,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    });

    const commandEncoder = device.createCommandEncoder();
    commandEncoder.copyBufferToBuffer(
      gpuBuffer,
      0,
      stagingBuffer,
      0,
      this.dataType.size,
    );

    device.queue.submit([commandEncoder.finish()]);
    await device.queue.onSubmittedWorkDone();
    await stagingBuffer.mapAsync(GPUMapMode.READ, 0, this.dataType.size);

    const res = this.dataType.read(
      new BufferReader(stagingBuffer.getMappedRange()),
    ) as Parsed<TData>;

    stagingBuffer.unmap();
    stagingBuffer.destroy();

    return res;
  }

  destroy() {
    if (this._destroyed) {
      return;
    }
    this._destroyed = true;
    if (this._subscription) {
      this._subscription();
    }
    this._buffer?.destroy();
  }

  toString(): string {
    return `buffer:${this._label ?? '<unnamed>'}`;
  }
}
