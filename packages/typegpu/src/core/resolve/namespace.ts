import {
  type NameRegistry,
  RandomNameRegistry,
  StrictNameRegistry,
} from '../../nameRegistry.ts';
import { $internal } from '../../shared/symbols.ts';
import type { TgpuDerived, TgpuSlot } from '../slot/slotTypes.ts';

type SlotToValueMap = Map<TgpuSlot<unknown>, unknown>;

export interface NamespaceInternal {
  memoizedResolves: WeakMap<
    // WeakMap because if the item does not exist anymore,
    // apart from this map, there is no way to access the cached value anyway.
    object,
    { slotToValueMap: SlotToValueMap; result: string }[]
  >;

  memoizedDerived: WeakMap<
    // WeakMap because if the "derived" does not exist anymore,
    // apart from this map, there is no way to access the cached value anyway.
    TgpuDerived<unknown>,
    { slotToValueMap: SlotToValueMap; result: unknown }[]
  >;

  nameRegistry: NameRegistry;
}

export interface Namespace {
  readonly [$internal]: NamespaceInternal;
}

class NamespaceImpl implements Namespace {
  readonly [$internal]: NamespaceInternal;

  constructor(nameRegistry: NameRegistry) {
    this[$internal] = {
      memoizedResolves: new WeakMap(),
      memoizedDerived: new WeakMap(),
      nameRegistry,
    };
  }
}

export interface NamespaceOptions {
  names?: 'random' | 'strict' | undefined;
}

export function namespace(options?: NamespaceOptions | undefined): Namespace {
  const { names = 'random' } = options || {};

  return new NamespaceImpl(
    names === 'strict' ? new StrictNameRegistry() : new RandomNameRegistry(),
  );
}
