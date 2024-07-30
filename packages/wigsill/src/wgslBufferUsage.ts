import type {
  AnyWgslData,
  BufferUsage,
  ResolutionCtx,
  WgslBindable,
} from './types';
import type { WgslBuffer } from './wgslBuffer';
import { WgslIdentifier } from './wgslIdentifier';

// ----------
// Public API
// ----------

export interface WgslBufferUsage<
  TData extends AnyWgslData,
  TUsage extends BufferUsage,
> extends WgslBindable<TData, TUsage> {
  $name(label: string): WgslBufferUsage<TData, TUsage>;
  vertexUsage: 'uniform' | 'readonly_storage' | 'mutable_storage';
}

export function bufferUsage<
  TData extends AnyWgslData,
  TUsage extends BufferUsage,
>(
  buffer: WgslBuffer<TData, TUsage>,
  usage: TUsage,
): WgslBufferUsage<TData, TUsage> {
  return new WgslBufferUsageImpl(buffer, usage);
}

// --------------
// Implementation
// --------------

class WgslBufferUsageImpl<TData extends AnyWgslData, TUsage extends BufferUsage>
  implements WgslBufferUsage<TData, TUsage>
{
  private _label: string | undefined;

  constructor(
    public readonly buffer: WgslBuffer<TData, TUsage>,
    public readonly usage: TUsage,
    public vertexUsage:
      | 'uniform'
      | 'readonly_storage'
      | 'mutable_storage' = 'uniform',
  ) {}

  get label() {
    return this._label;
  }

  get allocatable() {
    return this.buffer;
  }

  $name(label: string | undefined) {
    this._label = label;
    return this;
  }

  resolve(ctx: ResolutionCtx): string {
    const identifier = new WgslIdentifier();

    ctx.addBinding(this, identifier);

    return ctx.resolve(identifier);
  }

  toString(): string {
    return `${this.usage}:${this._label ?? '<unnamed>'}`;
  }
}
