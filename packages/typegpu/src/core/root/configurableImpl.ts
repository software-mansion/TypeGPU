import type { AnyData } from '../../data/dataTypes.ts';
import type { Infer } from '../../shared/repr.ts';
import {
  type AccessorIn,
  isAccessor,
  isMutableAccessor,
  type MutableAccessorIn,
  type TgpuAccessor,
  type TgpuMutableAccessor,
  type TgpuSlot,
} from '../slot/slotTypes.ts';
import type { Configurable } from './rootTypes.ts';

export class ConfigurableImpl implements Configurable {
  constructor(readonly bindings: [TgpuSlot<unknown>, unknown][]) {}

  with<T extends AnyData>(
    slot: TgpuSlot<T> | TgpuAccessor<T> | TgpuMutableAccessor<T>,
    value: AccessorIn<T> | MutableAccessorIn<T> | Infer<T>,
  ): Configurable {
    return new ConfigurableImpl([
      ...this.bindings,
      [isAccessor(slot) || isMutableAccessor(slot) ? slot.slot : slot, value],
    ]);
  }

  pipe(transform: (cfg: Configurable) => Configurable): Configurable {
    const newCfg = transform(this);
    return new ConfigurableImpl([...this.bindings, ...newCfg.bindings]);
  }
}
