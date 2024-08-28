import type { AnySchema, Parsed } from 'typed-binary';
import { SimpleWgslData } from '../data';
import type { AnyWgslData, BufferUsage, WgslAllocatable } from './types';
import { type WgslBufferUsage, bufferUsage } from './wgslBufferUsage';
import type { WgslPlum } from './wgslPlum';

// ----------
// Public API
// ----------

type UsageGuard<
  TUsage extends BufferUsage,
  TData extends AnyWgslData,
  TAllows,
> = TUsage extends TAllows ? WgslBufferUsage<TData, TUsage> : null;

export interface WgslBuffer<
  TData extends AnyWgslData,
  TAllows extends BufferUsage = never,
> extends WgslAllocatable<TData> {
  $name(label: string): WgslBuffer<TData, TAllows>;
  $allowUniform(): WgslBuffer<TData, TAllows | 'uniform'>;
  $allowReadonly(): WgslBuffer<TData, TAllows | 'readonly'>;
  $allowMutable(): WgslBuffer<TData, TAllows | 'mutable'>;
  $allowVertex(
    stepMode: 'vertex' | 'instance',
  ): WgslBuffer<TData, TAllows | 'vertex'>;
  $addFlags(flags: GPUBufferUsageFlags): WgslBuffer<TData, TAllows>;

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
): WgslBuffer<TData, TUsage> {
  return new WgslBufferImpl<TData, TUsage>(typeSchema, initial);
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

  constructor(
    public readonly dataType: TData,
    public readonly initial?: Parsed<TData> | WgslPlum<Parsed<TData>>,
  ) {}

  get label() {
    return this._label;
  }

  $name(label: string) {
    this._label = label;
    return this;
  }

  $allowUniform() {
    this.$addFlags(GPUBufferUsage.UNIFORM);

    const enrichedThis = this as WgslBuffer<TData, TAllows | 'uniform'>;
    if (!this._allowedUsages.uniform) {
      this._allowedUsages.uniform = bufferUsage(enrichedThis, 'uniform');
    }

    return enrichedThis;
  }

  $allowReadonly() {
    this.$addFlags(GPUBufferUsage.STORAGE);

    const enrichedThis = this as WgslBuffer<TData, TAllows | 'readonly'>;
    if (!this._allowedUsages.readonly) {
      this._allowedUsages.readonly = bufferUsage(enrichedThis, 'readonly');
    }

    return enrichedThis;
  }

  $allowMutable() {
    this.$addFlags(GPUBufferUsage.STORAGE);

    const enrichedThis = this as WgslBuffer<TData, TAllows | 'mutable'>;
    if (!this._allowedUsages.mutable) {
      this._allowedUsages.mutable = bufferUsage(enrichedThis, 'mutable');
    }

    return enrichedThis;
  }

  $allowVertex(stepMode: 'vertex' | 'instance' = 'vertex') {
    this.$addFlags(GPUBufferUsage.VERTEX);

    const enrichedThis = this as WgslBuffer<TData, TAllows | 'vertex'>;
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
