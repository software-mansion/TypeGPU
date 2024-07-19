import type { AnyWgslData } from './std140/types';
import type { BufferUsage, ResolutionCtx, WgslBufferBindable } from './types';
import type { WgslBuffer } from './wgslBuffer';

export interface WgslBufferUsage<
  TData extends AnyWgslData,
  TUsage extends BufferUsage,
> extends WgslBufferBindable<TData, TUsage> {}

export function bufferUsage<
  TData extends AnyWgslData,
  TUsage extends BufferUsage,
>(
  buffer: WgslBuffer<TData, TUsage>,
  usage: TUsage,
): WgslBufferUsage<TData, TUsage> {
  return new WgslBufferUsageImpl(buffer, usage);
}

class WgslBufferUsageImpl<TData extends AnyWgslData, TUsage extends BufferUsage>
  implements WgslBufferUsage<TData, TUsage>
{
  constructor(
    public readonly buffer: WgslBuffer<TData, TUsage>,
    public readonly usage: TUsage,
  ) {}

  get allocatable() {
    return this.buffer;
  }

  resolve(ctx: ResolutionCtx): string {
    ctx.addBinding(this);

    return ctx.resolve(this.buffer);
  }
}
