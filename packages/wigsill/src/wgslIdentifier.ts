import type { ResolutionCtx, WgslResolvable } from './types';
import { WgslResolvableBase } from './wgslResolvableBase';

/**
 * Helpful when creating new Resolvable types. For internal use.
 */
export class WgslIdentifier
  extends WgslResolvableBase
  implements WgslResolvable
{
  typeInfo = 'id';

  resolve(ctx: ResolutionCtx): string {
    return ctx.nameFor(this);
  }
}
