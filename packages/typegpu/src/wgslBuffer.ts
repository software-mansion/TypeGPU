import { BufferWriter, type Parsed } from 'typed-binary';
import { SimpleWgslData, WgslArrayImpl } from './data';
import type { AnyWgslData, BufferUsage, WgslAllocatable } from './types';
import { type WgslBufferUsage, bufferUsage } from './wgslBufferUsage';
import type { WgslPlum } from './wgslPlum';

// ----------
// Public API
// ----------

interface Unmanaged {
  get device(): GPUDevice;
  get buffer(): GPUBuffer;
}

type KeepUnion<T, U, N> = T extends U ? N & U : N;

type UsageGuard<
  TUsage extends BufferUsage,
  TData extends AnyWgslData,
  TAllows,
> = TUsage extends TAllows ? WgslBufferUsage<TData, TUsage> : null;

export interface WgslBuffer<
  TData extends AnyWgslData,
  TAllows extends BufferUsage = never,
> extends WgslAllocatable<TData> {
  $name(label: string): KeepUnion<this, Unmanaged, WgslBuffer<TData, TAllows>>;
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

  asUniform(): UsageGuard<'uniform', TData, TAllows>;
  asMutable(): UsageGuard<'mutable', TData, TAllows>;
  asReadonly(): UsageGuard<'readonly', TData, TAllows>;
  asVertex(): UsageGuard<'vertex', TData, TAllows>;
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
  private _allowedUsages: {
    uniform: WgslBufferUsage<TData, TAllows | 'uniform'> | null;
    mutable: WgslBufferUsage<TData, TAllows | 'mutable'> | null;
    readonly: WgslBufferUsage<TData, TAllows | 'readonly'> | null;
    vertex: WgslBufferUsage<TData, TAllows | 'vertex'> | null;
  } = {
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
    if (initialOrBuffer instanceof GPUBuffer) {
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
        mappedAtCreation: true,
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
    if (!this._allowedUsages.uniform) {
      this._allowedUsages.uniform = bufferUsage(enrichedThis, 'uniform');
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
    if (!this._allowedUsages.readonly) {
      this._allowedUsages.readonly = bufferUsage(enrichedThis, 'readonly');
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
    if (!this._allowedUsages.mutable) {
      this._allowedUsages.mutable = bufferUsage(enrichedThis, 'mutable');
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

        this._allowedUsages.vertex = bufferUsage(enrichedThis, 'vertex');
      } else if (this.dataType instanceof WgslArrayImpl) {
        this.vertexLayout = {
          arrayStride: this.dataType.elementType.size,
          stepMode,
        };

        this._allowedUsages.vertex = bufferUsage(enrichedThis, 'vertex');
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

  asUniform() {
    return this._allowedUsages.uniform as UsageGuard<'uniform', TData, TAllows>;
  }

  asMutable() {
    return this._allowedUsages.mutable as UsageGuard<'mutable', TData, TAllows>;
  }

  asReadonly() {
    return this._allowedUsages.readonly as UsageGuard<
      'readonly',
      TData,
      TAllows
    >;
  }

  asVertex() {
    return this._allowedUsages.vertex as UsageGuard<'vertex', TData, TAllows>;
  }

  toString(): string {
    return `buffer:${this._label ?? '<unnamed>'}`;
  }
}
