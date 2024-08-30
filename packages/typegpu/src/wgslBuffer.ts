import type { Parsed } from 'typed-binary';
import { SimpleWgslData, WgslArrayImpl } from './data';
import type {
  AnyWgslData,
  BufferUsage,
  WgslAllocatable,
  WgslNamable,
} from './types';
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
  $allowUniform(): WgslBuffer<TData, TAllows | 'uniform'>;
  $allowReadonly(): WgslBuffer<TData, TAllows | 'readonly'>;
  $allowMutable(): WgslBuffer<TData, TAllows | 'mutable'>;
  $allowVertex(
    stepMode: 'vertex' | 'instance',
  ): WgslBuffer<TData, TAllows | 'vertex'>;
  $addFlags(flags: GPUBufferUsageFlags): WgslBuffer<TData, TAllows>;

  _usages: AllowedUsages<TData, TAllows>;
  readonly label: string | undefined;
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
  public _usages: AllowedUsages<TData, TAllows> = {
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
    if (!this._usages.uniform) {
      this._usages.uniform = bufferUsage(enrichedThis, 'uniform');
    }

    return enrichedThis;
  }

  $allowReadonly() {
    this.$addFlags(GPUBufferUsage.STORAGE);

    const enrichedThis = this as WgslBuffer<TData, TAllows | 'readonly'>;
    if (!this._usages.readonly) {
      this._usages.readonly = bufferUsage(enrichedThis, 'readonly');
    }

    return enrichedThis;
  }

  $allowMutable() {
    this.$addFlags(GPUBufferUsage.STORAGE);

    const enrichedThis = this as WgslBuffer<TData, TAllows | 'mutable'>;
    if (!this._usages.mutable) {
      this._usages.mutable = bufferUsage(enrichedThis, 'mutable');
    }

    return enrichedThis;
  }

  $allowVertex(stepMode: 'vertex' | 'instance' = 'vertex') {
    this.$addFlags(GPUBufferUsage.VERTEX);

    const enrichedThis = this as WgslBuffer<TData, TAllows | 'vertex'>;
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
