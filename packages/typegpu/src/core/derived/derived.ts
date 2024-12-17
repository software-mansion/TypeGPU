import type { AnyWgslData } from '../../data';
import type { BaseWgslData } from '../../data/wgslTypes';
import type { Infer } from '../../shared/repr';
import type { TgpuDerived } from './derivedTypes';

// ----------
// Public API
// ----------

export function derived<T extends AnyWgslData>(dataType: T) {
  return new TgpuDerivedImpl(dataType);
}

// --------------
// Implementation
// --------------

class TgpuDerivedImpl<TData extends BaseWgslData>
  implements TgpuDerived<TData>
{
  constructor(public readonly dataType: TData) {}

  get value(): Infer<TData> {
    return undefined as unknown as Infer<TData>;
  }
}
