import { namable, resolvable } from './decorators';
import type {
  AnyWgslData,
  BufferUsage,
  ResolutionCtx,
  WgslBindable,
} from './types';
import type { WgslBuffer } from './wgslBuffer';
import { makeIdentifier } from './wgslIdentifier';

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
  return makeBufferUsage(buffer, usage);
}

// --------------
// Implementation
// --------------

function resolveBufferUsage<
  TData extends AnyWgslData,
  TUsage extends BufferUsage,
>(this: WgslBufferUsage<TData, TUsage>, ctx: ResolutionCtx) {
  const identifier = makeIdentifier();
  ctx.addBinding(this, identifier);
  return ctx.resolve(identifier);
}

const makeBufferUsage = <TData extends AnyWgslData, TUsage extends BufferUsage>(
  buffer: WgslBuffer<TData, TUsage>,
  usage: TUsage,
) =>
  namable(
    resolvable(
      { typeInfo: usage },
      {
        buffer,
        usage,

        resolve: resolveBufferUsage,

        get allocatable() {
          return this.buffer;
        },
      },
    ),
  );
