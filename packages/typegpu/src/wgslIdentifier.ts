import { namable, resolvable } from './decorators';
import type { ResolutionCtx, WgslNamable, WgslResolvable } from './types';

/**
 * Helpful when creating new Resolvable types. For internal use.
 */

function resolveIdentifier(this: WgslIdentifier, ctx: ResolutionCtx): string {
  return ctx.nameFor(this);
}

export type WgslIdentifier = WgslNamable & WgslResolvable;
export const makeIdentifier = () =>
  namable(
    resolvable(
      {
        typeInfo: 'id',
      },
      {
        resolve: resolveIdentifier,
      },
    ),
  );
