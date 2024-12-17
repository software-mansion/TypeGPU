import type { BaseWgslData } from '../../data/wgslTypes';
import type { Infer } from '../../shared/repr';

export interface TgpuDerived<T extends BaseWgslData> {
  readonly dataType: T;
  readonly value: Infer<T>;
}
