import { 
  type Eventual, 
  isDerived, 
  isProviding, 
  isSlot, 
  type SlotValuePair, 
  type TgpuDerived, 
  type TgpuSlot 
} from './core/slot/slotTypes.ts';
import { MissingSlotValueError } from './errors.ts';
import { $providing } from './shared/symbols.ts';

/**
 * Unified execution context interface for all execution modes.
 * Provides access to slots and manages dependency injection during code execution.
 */
export interface ExecutionCtx {
  readSlot<T>(slot: TgpuSlot<T>): T | undefined;
  withSlots<T>(pairs: SlotValuePair[], callback: () => T): T;
  unwrap<T>(eventual: Eventual<T>): T;
}

/**
 * Implementation of ExecutionCtx for COMPTIME and SIMULATE modes.
 * Can share slot implementation with ResolutionCtxImpl since ResolutionCtx extends ExecutionCtx.
 */
export class ExecutionCtxImpl implements ExecutionCtx {
  private slotStack: WeakMap<TgpuSlot<any>, any>[] = [new WeakMap()];

  readSlot<T>(slot: TgpuSlot<T>): T | undefined {
    // Shared implementation with ResolutionCtxImpl
    for (let i = this.slotStack.length - 1; i >= 0; i--) {
      const layer = this.slotStack[i];
      if (layer && layer.has(slot)) {
        return layer.get(slot);
      }
    }
    return slot.defaultValue;
  }

  withSlots<T>(pairs: SlotValuePair[], callback: () => T): T {
    // Shared implementation with ResolutionCtxImpl
    const newLayer = new WeakMap(pairs);
    this.slotStack.push(newLayer);
    try {
      return callback();
    } finally {
      this.slotStack.pop();
    }
  }

  unwrap<T>(eventual: Eventual<T>): T {
    if (isProviding(eventual)) {
      return this.withSlots(
        eventual[$providing].pairs,
        () => this.unwrap(eventual[$providing].inner) as T,
      );
    }

    let maybeEventual = eventual;

    // Unwrapping all layers of slots.
    while (true) {
      if (isSlot(maybeEventual)) {
        const value = this.readSlot(maybeEventual);
        if (value === undefined) {
          throw new MissingSlotValueError(maybeEventual);
        }
        maybeEventual = value;
      } else if (isDerived(maybeEventual)) {
        // For COMPTIME mode, we need to compute derived values
        // For SIMULATE mode, derived values should already be computed
        maybeEventual = this._computeDerived(maybeEventual);
      } else {
        break;
      }
    }

    return maybeEventual;
  }

  private _computeDerived<T>(derived: TgpuDerived<T>): T {
    // Simple computation for ExecutionCtxImpl
    // In a real implementation, this might need memoization like ResolutionCtxImpl
    return derived['~compute']();
  }
}