import type { Unwrap } from 'typed-binary';
import { inGPUMode } from './gpuMode';
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
> extends TgpuBindable<TData, TUsage> {
  value: Unwrap<TData>;
}

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

  $name(label: string) {
    this.buffer.$name(label);
  }

  resolve(ctx: ResolutionCtx): string {
    const identifier = new TgpuIdentifier().$name(this.label);

    ctx.addBinding(this, identifier);

    return ctx.resolve(identifier);
  }

  toString(): string {
    return `${this.usage}:${this.label ?? '<unnamed>'}`;
  }

  get value(): Unwrap<TData> {
    if (!inGPUMode()) {
      throw new Error(`Cannot access buffer's value directly in JS.`);
    }
    return this as Unwrap<TData>;
  }
}
