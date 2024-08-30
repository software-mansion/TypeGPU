import { BufferWriter, type Parsed } from 'typed-binary';
import { SimpleWgslData, WgslArrayImpl } from './data';
import {
  type AnyWgslData,
  type BufferUsage,
  type WgslAllocatable,
  type WgslNamable,
  isGPUBuffer,
} from './types';
import { type WgslBufferUsage, bufferUsage } from './wgslBufferUsage';
import type { WgslPlum } from './wgslPlum';

// ----------
// Public API
// ----------

export interface Unmanaged {
  get device(): GPUDevice;
  get buffer(): GPUBuffer;
}

type KeepUnion<T, U, N> = T extends U ? N & U : N;

type UsageGuard<
  TUsage extends BufferUsage,
  TData extends AnyWgslData,
  TAllows,
> = TUsage extends TAllows ? WgslBufferUsage<TData, TUsage> : null;

type AllowedUsages<
  TData extends AnyWgslData,
  TAllows extends BufferUsage = never,
> = {
  uniform: WgslBufferUsage<TData, TAllows | 'uniform'> | null;
  mutable: WgslBufferUsage<TData, TAllows | 'mutable'> | null;
  readonly: WgslBufferUsage<TData, TAllows | 'readonly'> | null;
  vertex: WgslBufferUsage<TData, TAllows | 'vertex'> | null;
};

export interface WgslBuffer<
  TData extends AnyWgslData,
  TAllows extends BufferUsage = never,
> extends WgslAllocatable<TData>,
    WgslNamable {
  $allowUniform(): KeepUnion<
    this,
    Unmanaged,
    WgslBuffer<TData, TAllows | 'uniform'>
  >;
  $allowReadonly(): KeepUnion<
    this,
    Unmanaged,
    WgslBuffer<TData, TAllows | 'readonly'>
  >;
  $allowMutable(): KeepUnion<
    this,
    Unmanaged,
    WgslBuffer<TData, TAllows | 'mutable'>
  >;
  $allowVertex(
    stepMode: 'vertex' | 'instance',
  ): KeepUnion<this, Unmanaged, WgslBuffer<TData, TAllows | 'vertex'>>;
  $addFlags(
    flags: GPUBufferUsageFlags,
  ): KeepUnion<this, Unmanaged, WgslBuffer<TData, TAllows>>;
  $device(device: GPUDevice): WgslBuffer<TData, TAllows> & Unmanaged;

  get buffer(): GPUBuffer;

  _usages: AllowedUsages<TData, TAllows>;
  readonly label: string | undefined;
}

export function buffer<
  TData extends AnyWgslData,
  TUsage extends BufferUsage = never,
>(
  typeSchema: TData,
  initial?: Parsed<TData> | WgslPlum<Parsed<TData>> | undefined,
): WgslBuffer<TData, TUsage>;

export function buffer<
  TData extends AnyWgslData,
  TUsage extends BufferUsage = never,
>(typeSchema: TData, gpuBuffer: GPUBuffer): WgslBuffer<TData, TUsage>;
export function buffer<
  TData extends AnyWgslData,
  TUsage extends BufferUsage = never,
>(
  typeSchema: TData,
  initialOrBuffer?: Parsed<TData> | WgslPlum<Parsed<TData>> | GPUBuffer,
): WgslBuffer<TData, TUsage> {
  return new WgslBufferImpl(typeSchema, initialOrBuffer);
}

// --------------
// Implementation
// --------------

class WgslBufferImpl<
  TData extends AnyWgslData,
  TAllows extends BufferUsage = never,
> implements WgslBuffer<TData, TAllows>
{
  public flags: GPUBufferUsageFlags =
    GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC;
  private _device: GPUDevice | null = null;
  private _buffer: GPUBuffer | null = null;

  public vertexLayout: Omit<GPUVertexBufferLayout, 'attributes'> | null = null;
  public _usages: AllowedUsages<TData, TAllows> = {
    uniform: null,
    mutable: null,
    readonly: null,
    vertex: null,
  };

  private _label: string | undefined;
  readonly initial: Parsed<TData> | WgslPlum<Parsed<TData>> | undefined;

  constructor(
    public readonly dataType: TData,
    public readonly initialOrBuffer?:
      | Parsed<TData>
      | WgslPlum<Parsed<TData>>
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
        'This buffer is managed by TypeGPU and cannot be used directly',
      );
    }
    return this._device;
  }

  $name(label: string) {
    this._label = label;
    return this;
  }

  $allowUniform() {
    this.$addFlags(GPUBufferUsage.UNIFORM);

    const enrichedThis = this as KeepUnion<
      this,
      Unmanaged,
      WgslBuffer<TData, TAllows | 'uniform'>
    >;
    if (!this._usages.uniform) {
      this._usages.uniform = bufferUsage(enrichedThis, 'uniform');
    }

    return enrichedThis;
  }

  $allowReadonly() {
    this.$addFlags(GPUBufferUsage.STORAGE);

    const enrichedThis = this as KeepUnion<
      this,
      Unmanaged,
      WgslBuffer<TData, TAllows | 'readonly'>
    >;
    if (!this._usages.readonly) {
      this._usages.readonly = bufferUsage(enrichedThis, 'readonly');
    }

    return enrichedThis;
  }

  $allowMutable() {
    this.$addFlags(GPUBufferUsage.STORAGE);

    const enrichedThis = this as KeepUnion<
      this,
      Unmanaged,
      WgslBuffer<TData, TAllows | 'mutable'>
    >;
    if (!this._usages.mutable) {
      this._usages.mutable = bufferUsage(enrichedThis, 'mutable');
    }

    return enrichedThis;
  }

  $allowVertex(stepMode: 'vertex' | 'instance' = 'vertex') {
    this.$addFlags(GPUBufferUsage.VERTEX);

    const enrichedThis = this as KeepUnion<
      this,
      Unmanaged,
      WgslBuffer<TData, TAllows | 'vertex'>
    >;
    if (!this.vertexLayout) {
      if (this.dataType instanceof SimpleWgslData) {
        this.vertexLayout = {
          arrayStride: this.dataType.size,
          stepMode,
        };

        this._usages.vertex = bufferUsage(enrichedThis, 'vertex');
      } else if (this.dataType instanceof WgslArrayImpl) {
        this.vertexLayout = {
          arrayStride: this.dataType.elementType.size,
          stepMode,
        };

        this._usages.vertex = bufferUsage(enrichedThis, 'vertex');
      } else {
        throw new Error('Only simple data types can be used as vertex buffers');
      }
    }

    if (this.vertexLayout.stepMode !== stepMode) {
      throw new Error('Cannot change step mode of a vertex buffer');
    }

    return enrichedThis;
  }

  // Temporary solution
  $addFlags(flags: GPUBufferUsageFlags) {
    this.flags |= flags;
    return this;
  }

  $device(device: GPUDevice) {
    this._device = device;
    return this as WgslBuffer<TData, TAllows> & Unmanaged;
  }

  toString(): string {
    return `buffer:${this._label ?? '<unnamed>'}`;
  }
}

function capitalizeFirstLetter(string: string) {
  return string.charAt(0).toUpperCase() + string.slice(1);
}

function asUsage<TUsage extends BufferUsage>(usage: TUsage) {
  return <TData extends AnyWgslData, TAllows extends BufferUsage>(
    buffer: WgslBuffer<TData, TAllows>,
  ) => {
    if (buffer._usages[usage] === null) {
      throw new Error(
        `Cannot pass ${buffer} to as${capitalizeFirstLetter(usage)} function, as the buffer does not allow ${usage} usage. To allow it, use $allow${capitalizeFirstLetter(usage)} WgslBuffer method.`,
      );
    }
    return buffer._usages[usage] as UsageGuard<TUsage, TData, TAllows>;
  };
}

export const asUniform = asUsage('uniform');
export const asReadonly = asUsage('readonly');
export const asMutable = asUsage('mutable');
export const asVertex = asUsage('vertex');
