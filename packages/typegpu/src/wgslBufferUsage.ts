import type {
  AnyTgpuData,
  BufferUsage,
  ResolutionCtx,
  TgpuBindable,
} from './types';
import type { TgpuBuffer } from './wgslBuffer';
import { TgpuIdentifier } from './wgslIdentifier';

// ----------
// Public API
// ----------

export interface TgpuBufferUsage<
  TData extends AnyTgpuData,
  TUsage extends BufferUsage = BufferUsage,
> extends TgpuBindable<TData, TUsage> {}

export function bufferUsage<
  TData extends AnyTgpuData,
  TUsage extends BufferUsage,
>(buffer: TgpuBuffer<TData>, usage: TUsage): TgpuBufferUsage<TData, TUsage> {
  return new TgpuBufferUsageImpl(buffer, usage);
}

// --------------
// Implementation
// --------------

class TgpuBufferUsageImpl<TData extends AnyTgpuData, TUsage extends BufferUsage>
  implements TgpuBufferUsage<TData, TUsage>
{
  constructor(
    public readonly buffer: TgpuBuffer<TData>,
    public readonly usage: TUsage,
  ) {}

  get label() {
    return this.buffer.label;
  }

  get allocatable() {
    return this.buffer;
  }

  resolve(ctx: ResolutionCtx): string {
    const identifier = new TgpuIdentifier().$name(this.label);

    ctx.addBinding(this, identifier);

    return ctx.resolve(identifier);
  }

  toString(): string {
    return `${this.usage}:${this.label ?? '<unnamed>'}`;
  }
}
