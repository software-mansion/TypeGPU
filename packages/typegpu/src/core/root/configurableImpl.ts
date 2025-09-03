import type { Infer } from '../../shared/repr.ts';
import type { AnyWgslData } from '../../data/wgslTypes.ts';
import type { TgpuBufferUsage } from '../buffer/bufferUsage.ts';
import type { TgpuFn } from '../function/tgpuFn.ts';
import {
  isAccessor,
  type TgpuAccessor,
  type TgpuSlot,
} from '../slot/slotTypes.ts';
import type { Configurable } from './rootTypes.ts';

export class ConfigurableImpl implements Configurable {
  constructor(readonly bindings: [TgpuSlot<unknown>, unknown][]) {}

  with<T extends AnyWgslData>(
    slot: TgpuSlot<T> | TgpuAccessor<T>,
    value: T | TgpuFn<() => T> | TgpuBufferUsage<T> | Infer<T>,
  ): Configurable {
    return new ConfigurableImpl([
      ...this.bindings,
      [isAccessor(slot) ? slot.slot : slot, value],
    ]);
  }

  pipe(transform: (cfg: Configurable) => Configurable): Configurable {
    const newCfg = transform(this);
    return new ConfigurableImpl([
      ...this.bindings,
      ...newCfg.bindings,
    ]);
  }
}
