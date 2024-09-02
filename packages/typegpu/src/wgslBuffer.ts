import type { Parsed } from 'typed-binary';
import { SimpleTgpuData, TgpuArrayImpl } from './data';
import type {
  AnyTgpuData,
  BufferUsage,
  TgpuAllocatable,
  TgpuNamable,
} from './types';
import { type TgpuBufferUsage, bufferUsage } from './wgslBufferUsage';
import type { TgpuPlum } from './wgslPlum';

// ----------
// Public API
// ----------

type UsageGuard<
  TUsage extends BufferUsage,
  TData extends AnyTgpuData,
  TAllows,
> = TUsage extends TAllows ? TgpuBufferUsage<TData, TUsage> : null;

type AllowedUsages<
  TData extends AnyTgpuData,
  TAllows extends BufferUsage = never,
> = {
  uniform: TgpuBufferUsage<TData, TAllows | 'uniform'> | null;
  mutable: TgpuBufferUsage<TData, TAllows | 'mutable'> | null;
  readonly: TgpuBufferUsage<TData, TAllows | 'readonly'> | null;
  vertex: TgpuBufferUsage<TData, TAllows | 'vertex'> | null;
};

export interface TgpuBuffer<
  TData extends AnyTgpuData,
  TAllows extends BufferUsage = never,
> extends TgpuAllocatable<TData>,
    TgpuNamable {
  $allowUniform(): TgpuBuffer<TData, TAllows | 'uniform'>;
  $allowReadonly(): TgpuBuffer<TData, TAllows | 'readonly'>;
  $allowMutable(): TgpuBuffer<TData, TAllows | 'mutable'>;
  $allowVertex(
    stepMode: 'vertex' | 'instance',
  ): TgpuBuffer<TData, TAllows | 'vertex'>;
  $addFlags(flags: GPUBufferUsageFlags): TgpuBuffer<TData, TAllows>;

  _usages: AllowedUsages<TData, TAllows>;
  readonly label: string | undefined;
}

export function buffer<
  TData extends AnyTgpuData,
  TUsage extends BufferUsage = never,
>(
  typeSchema: TData,
  initial?: Parsed<TData> | TgpuPlum<Parsed<TData>> | undefined,
): TgpuBuffer<TData, TUsage> {
  return new TgpuBufferImpl<TData, TUsage>(typeSchema, initial);
}

// --------------
// Implementation
// --------------

class TgpuBufferImpl<
  TData extends AnyTgpuData,
  TAllows extends BufferUsage = never,
> implements TgpuBuffer<TData, TAllows>
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
    public readonly initial?: Parsed<TData> | TgpuPlum<Parsed<TData>>,
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

    const enrichedThis = this as TgpuBuffer<TData, TAllows | 'uniform'>;
    if (!this._usages.uniform) {
      this._usages.uniform = bufferUsage(enrichedThis, 'uniform');
    }

    return enrichedThis;
  }

  $allowReadonly() {
    this.$addFlags(GPUBufferUsage.STORAGE);

    const enrichedThis = this as TgpuBuffer<TData, TAllows | 'readonly'>;
    if (!this._usages.readonly) {
      this._usages.readonly = bufferUsage(enrichedThis, 'readonly');
    }

    return enrichedThis;
  }

  $allowMutable() {
    this.$addFlags(GPUBufferUsage.STORAGE);

    const enrichedThis = this as TgpuBuffer<TData, TAllows | 'mutable'>;
    if (!this._usages.mutable) {
      this._usages.mutable = bufferUsage(enrichedThis, 'mutable');
    }

    return enrichedThis;
  }

  $allowVertex(stepMode: 'vertex' | 'instance' = 'vertex') {
    this.$addFlags(GPUBufferUsage.VERTEX);

    const enrichedThis = this as TgpuBuffer<TData, TAllows | 'vertex'>;
    if (!this.vertexLayout) {
      if (this.dataType instanceof SimpleTgpuData) {
        this.vertexLayout = {
          arrayStride: this.dataType.size,
          stepMode,
        };

        this._usages.vertex = bufferUsage(enrichedThis, 'vertex');
      } else if (this.dataType instanceof TgpuArrayImpl) {
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
  return <TData extends AnyTgpuData, TAllows extends BufferUsage>(
    buffer: TgpuBuffer<TData, TAllows>,
  ) => {
    if (buffer._usages[usage] === null) {
      throw new Error(
        `Cannot pass ${buffer} to as${capitalizeFirstLetter(usage)} function, as the buffer does not allow ${usage} usage. To allow it, use $allow${capitalizeFirstLetter(usage)} TgpuBuffer method.`,
      );
    }
    return buffer._usages[usage] as UsageGuard<TUsage, TData, TAllows>;
  };
}

export const asUniform = asUsage('uniform');
export const asReadonly = asUsage('readonly');
export const asMutable = asUsage('mutable');
export const asVertex = asUsage('vertex');
