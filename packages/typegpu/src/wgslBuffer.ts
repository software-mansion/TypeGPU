import { BufferWriter, type Parsed } from 'typed-binary';
import { SimpleTgpuData, TgpuArrayImpl } from './data';
import {
  type AnyTgpuData,
  type BufferUsage,
  type TgpuAllocatable,
  type TgpuNamable,
  isGPUBuffer,
} from './types';
import { type TgpuBufferUsage, bufferUsage } from './wgslBufferUsage';
import type { TgpuPlum } from './wgslPlum';

// ----------
// Public API
// ----------

export interface Unmanaged {
  readonly device: GPUDevice;
  readonly buffer: GPUBuffer;
}

export interface AllowUniform {
  uniformAllowed: true;
}
export interface AllowReadonly {
  readonlyAllowed: true;
}
export interface AllowMutable {
  mutableAllowed: true;
}
export interface AllowVertex {
  vertexAllowed: true;
}

type AllowedUsages<TData extends AnyTgpuData> = {
  uniform: TgpuBufferUsage<TData, 'uniform'> | null;
  mutable: TgpuBufferUsage<TData, 'mutable'> | null;
  readonly: TgpuBufferUsage<TData, 'readonly'> | null;
  vertex: TgpuBufferUsage<TData, 'vertex'> | null;
};

export interface TgpuBuffer<TData extends AnyTgpuData>
  extends TgpuAllocatable<TData>,
    TgpuNamable {
  $allowUniform(): this & AllowUniform;
  $allowReadonly(): this & AllowReadonly;
  $allowMutable(): this & AllowMutable;
  $allowVertex(stepMode: 'vertex' | 'instance'): this & AllowVertex;
  $addFlags(flags: GPUBufferUsageFlags): this;
  $device(device: GPUDevice): this & Unmanaged;
  destroy(): void;

  _usages: AllowedUsages<TData>;
  readonly destroyed: boolean;
  readonly label: string | undefined;
}

export function buffer<TData extends AnyTgpuData>(
  typeSchema: TData,
  initial?: Parsed<TData> | TgpuPlum<Parsed<TData>> | undefined,
): TgpuBuffer<TData>;

export function buffer<TData extends AnyTgpuData>(
  typeSchema: TData,
  gpuBuffer: GPUBuffer,
): TgpuBuffer<TData>;

export function buffer<TData extends AnyTgpuData>(
  typeSchema: TData,
  initialOrBuffer?: Parsed<TData> | TgpuPlum<Parsed<TData>> | GPUBuffer,
): TgpuBuffer<TData> {
  return new TgpuBufferImpl(typeSchema, initialOrBuffer);
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

  _usages: AllowedUsages<TData> = {
    uniform: null,
    mutable: null,
    readonly: null,
    vertex: null,
  };

  public vertexLayout: Omit<GPUVertexBufferLayout, 'attributes'> | null = null;

  private _label: string | undefined;
  readonly initial: Parsed<TData> | TgpuPlum<Parsed<TData>> | undefined;

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

  $allowUniform() {
    this.$addFlags(GPUBufferUsage.UNIFORM);
    if (!this._usages.uniform) {
      this._usages.uniform = bufferUsage(this, 'uniform');
    }

    return this as this & AllowUniform;
  }

  $allowReadonly() {
    this.$addFlags(GPUBufferUsage.STORAGE);

    if (!this._usages.readonly) {
      this._usages.readonly = bufferUsage(this, 'readonly');
    }

    return this as this & AllowReadonly;
  }

  $allowMutable() {
    this.$addFlags(GPUBufferUsage.STORAGE);

    if (!this._usages.mutable) {
      this._usages.mutable = bufferUsage(this, 'mutable');
    }

    return this as this & AllowMutable;
  }

  $allowVertex(stepMode: 'vertex' | 'instance' = 'vertex') {
    this.$addFlags(GPUBufferUsage.VERTEX);

    if (!this.vertexLayout) {
      if (this.dataType instanceof SimpleTgpuData) {
        this.vertexLayout = {
          arrayStride: this.dataType.size,
          stepMode,
        };

        this._usages.vertex = bufferUsage(this, 'vertex');
      } else if (this.dataType instanceof TgpuArrayImpl) {
        this.vertexLayout = {
          arrayStride: this.dataType.elementType.size,
          stepMode,
        };

        this._usages.vertex = bufferUsage(this, 'vertex');
      } else {
        throw new Error('Only simple data types can be used as vertex buffers');
      }
    }

    if (this.vertexLayout.stepMode !== stepMode) {
      throw new Error('Cannot change step mode of a vertex buffer');
    }

    return this as this & AllowVertex;
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

function capitalizeFirstLetter(string: string) {
  return string.charAt(0).toUpperCase() + string.slice(1);
}

function asUsage<
  TUsage extends BufferUsage,
  TType extends AllowVertex | AllowUniform | AllowReadonly | AllowMutable,
>(usage: TUsage, _: TType) {
  return <TData extends AnyTgpuData>(
    buffer: TgpuBuffer<TData> & TType,
  ): TgpuBufferUsage<TData, TUsage> => {
    if (buffer._usages[usage] === null) {
      throw new Error(
        `Cannot pass ${buffer} to as${capitalizeFirstLetter(usage)} function, as the buffer does not allow ${usage} usage. To allow it, use $allow${capitalizeFirstLetter(usage)} TgpuBuffer method.`,
      );
    }
    return buffer._usages[usage] as TgpuBufferUsage<TData, TUsage>;
  };
}

export const asUniform = asUsage('uniform', {
  uniformAllowed: true,
} as AllowUniform);
export const asReadonly = asUsage('readonly', {
  readonlyAllowed: true,
} as AllowReadonly);
export const asMutable = asUsage('mutable', {
  mutableAllowed: true,
} as AllowMutable);
export const asVertex = asUsage('vertex', {
  vertexAllowed: true,
} as AllowVertex);
