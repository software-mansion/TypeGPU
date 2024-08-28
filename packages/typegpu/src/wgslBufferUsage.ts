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
  TUsage extends BufferUsage = BufferUsage,
> extends WgslBindable<TData, TUsage> {}

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
  constructor(
    public readonly buffer: WgslBuffer<TData, TUsage>,
    public readonly usage: TUsage,
  ) {}

  get label() {
    return this.buffer.label;
  }

  get allocatable() {
    return this.buffer;
  }

  resolve(ctx: ResolutionCtx): string {
    const identifier = new WgslIdentifier();

    ctx.addBinding(this, identifier);

    return ctx.resolve(identifier);
  }

  toString(): string {
    return `${this.usage}:${this.label ?? '<unnamed>'}`;
  }
}
