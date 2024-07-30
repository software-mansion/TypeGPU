import type { ResolutionCtx, WgslNamable, WgslResolvable } from './types';
import { WgslResolvableBase } from './wgslResolvableBase';

/**
 * Helpful when creating new Resolvable types. For internal use.
 */
export class WgslIdentifier
  extends WgslResolvableBase
  implements WgslResolvable, WgslNamable
{
  readonly typeInfo = 'id';

  resolve(ctx: ResolutionCtx): string {
    return ctx.nameFor(this);
  }
}
