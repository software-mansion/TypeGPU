import type { AnyWgslData } from './std140/types';
import type { BufferUsage, ResolutionCtx, WgslBufferBindable } from './types';
import type { WgslBuffer } from './wgslBuffer';
import { WgslIdentifier } from './wgslIdentifier';

export interface WgslBufferUsage<
  TData extends AnyWgslData,
  TUsage extends BufferUsage,
> extends WgslBufferBindable<TData, TUsage> {
  $name(debugLabel: string): WgslBufferUsage<TData, TUsage>;
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

class WgslBufferUsageImpl<TData extends AnyWgslData, TUsage extends BufferUsage>
  implements WgslBufferUsage<TData, TUsage>
{
  private readonly _identifier = new WgslIdentifier();
  private _debugLabel: string | undefined;

  constructor(
    public readonly buffer: WgslBuffer<TData, TUsage>,
    public readonly usage: TUsage,
  ) {}

  public get debugLabel() {
    return this._debugLabel;
  }

  get allocatable() {
    return this.buffer;
  }

  $name(debugLabel: string | undefined) {
    this._debugLabel = debugLabel;
    return this;
  }

  resolve(ctx: ResolutionCtx): string {
    ctx.addBinding(this);

    return ctx.resolve(this._identifier);
  }
}
