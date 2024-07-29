import {
  type AnySchema,
  BufferReader,
  BufferWriter,
  type Parsed,
} from 'typed-binary';
import type { AnyWgslData } from './std140/types';
import type { BufferUsage, WgslAllocatable } from './types';
import { type WgslBufferUsage, bufferUsage } from './wgslBufferUsage';
import type WigsillRuntime from './wigsillRuntime';
import { SimpleWgslData } from './std140';

// ----------
// Public API
// ----------

export interface WgslBuffer<
  TData extends AnyWgslData,
  TAllows extends BufferUsage = never,
> extends WgslAllocatable<TData> {
  $name(label: string): WgslBuffer<TData, TAllows>;
  $allowUniform(): WgslBuffer<TData, TAllows | 'uniform'>;
  $allowReadonlyStorage(): WgslBuffer<TData, TAllows | 'readonly_storage'>;
  $allowMutableStorage(): WgslBuffer<TData, TAllows | 'mutable_storage'>;
  $allowVertex(
    stepMode: 'vertex' | 'instance',
  ): WgslBuffer<TData, TAllows | 'vertex'>;
  $addFlags(flags: GPUBufferUsageFlags): WgslBuffer<TData, TAllows>;

  write(runtime: WigsillRuntime, data: Parsed<TData>): void;
  read(runtime: WigsillRuntime): Promise<Parsed<TData>>;

  asUniform(): 'uniform' extends TAllows
    ? WgslBufferUsage<TData, 'uniform'>
    : null;

  asStorage(): 'mutable_storage' extends TAllows
    ? WgslBufferUsage<TData, 'mutable_storage'>
    : null;

  asReadonlyStorage(): 'readonly_storage' extends TAllows
    ? WgslBufferUsage<TData, 'readonly_storage'>
    : null;

  asVertex(): 'vertex' extends TAllows
    ? WgslBufferUsage<TData, 'vertex'>
    : null;
}

export function buffer<
  TData extends AnyWgslData,
  TUsage extends BufferUsage = never,
>(typeSchema: TData): WgslBuffer<TData, TUsage> {
  return new WgslBufferImpl<TData, TUsage>(typeSchema);
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

  public vertexLayout: Omit<GPUVertexBufferLayout, 'attributes'> | null = null;
  private _allowedUsages: {
    uniform: WgslBufferUsage<TData, TAllows | 'uniform'> | null;
    mutableStorage: WgslBufferUsage<TData, TAllows | 'mutable_storage'> | null;
    readonlyStorage: WgslBufferUsage<
      TData,
      TAllows | 'readonly_storage'
    > | null;
    vertex: WgslBufferUsage<TData, TAllows | 'vertex'> | null;
  } = {
    uniform: null,
    mutableStorage: null,
    readonlyStorage: null,
    vertex: null,
  };

  private _label: string | undefined;

  constructor(public readonly dataType: TData) {}

  get label() {
    return this._label;
  }

  $name(label: string) {
    this._label = label;
    return this;
  }

  write(runtime: WigsillRuntime, data: Parsed<TData>): void {
    const gpuBuffer = runtime.bufferFor(this);

    const hostBuffer = new ArrayBuffer(this.dataType.size);
    this.dataType.write(new BufferWriter(hostBuffer), data);
    runtime.device.queue.writeBuffer(
      gpuBuffer,
      0,
      hostBuffer,
      0,
      this.dataType.size,
    );
  }

  async read(runtime: WigsillRuntime): Promise<Parsed<TData>> {
    const arrayBuffer = await runtime.valueFor(this);

    const res = this.dataType.read(
      new BufferReader(arrayBuffer),
    ) as Parsed<TData>;
    return res;
  }

  $allowUniform() {
    const enrichedThis = this as WgslBuffer<TData, TAllows | 'uniform'>;
    this.$addFlags(GPUBufferUsage.UNIFORM);
    if (!this._allowedUsages.uniform) {
      this._allowedUsages.uniform = bufferUsage(enrichedThis, 'uniform');
    }
    return enrichedThis;
  }

  $allowReadonlyStorage() {
    const enrichedThis = this as WgslBuffer<
      TData,
      TAllows | 'readonly_storage'
    >;
    this.$addFlags(GPUBufferUsage.STORAGE);
    if (!this._allowedUsages.readonlyStorage) {
      this._allowedUsages.readonlyStorage = bufferUsage(
        enrichedThis,
        'readonly_storage',
      );
    }
    return enrichedThis;
  }

  $allowMutableStorage() {
    const enrichedThis = this as WgslBuffer<TData, TAllows | 'mutable_storage'>;
    this.$addFlags(GPUBufferUsage.STORAGE);
    if (!this._allowedUsages.mutableStorage) {
      this._allowedUsages.mutableStorage = bufferUsage(
        enrichedThis,
        'mutable_storage',
      );
    }
    return enrichedThis;
  }

  $allowVertex(stepMode: 'vertex' | 'instance' = 'vertex') {
    const enrichedThis = this as WgslBuffer<TData, TAllows | 'vertex'>;
    this.$addFlags(GPUBufferUsage.VERTEX);
    if (!this.vertexLayout) {
      if (!(this.dataType instanceof SimpleWgslData)) {
        throw new Error('Only simple data types can be used as vertex buffers');
      }
      let underlyingThis = this.dataType as SimpleWgslData<AnySchema>;
      underlyingThis = underlyingThis.getUnderlyingType();
      this.vertexLayout = {
        arrayStride: underlyingThis.size,
        stepMode,
      };
      this._allowedUsages.vertex = bufferUsage(enrichedThis, 'vertex');
    }
    return enrichedThis;
  }

  // Temporary solution
  $addFlags(flags: GPUBufferUsageFlags) {
    this.flags |= flags;
    return this;
  }

  asUniform() {
    return this._allowedUsages.uniform as 'uniform' extends TAllows
      ? WgslBufferUsage<TData, 'uniform'>
      : null;
  }

  asStorage() {
    return this._allowedUsages
      .mutableStorage as 'mutable_storage' extends TAllows
      ? WgslBufferUsage<TData, 'mutable_storage'>
      : null;
  }

  asReadonlyStorage() {
    return this._allowedUsages
      .readonlyStorage as 'readonly_storage' extends TAllows
      ? WgslBufferUsage<TData, 'readonly_storage'>
      : null;
  }

  asVertex() {
    return this._allowedUsages.vertex as 'vertex' extends TAllows
      ? WgslBufferUsage<TData, 'vertex'>
      : null;
  }

  toString(): string {
    return `buffer:${this._label ?? '<unnamed>'}`;
  }
}
