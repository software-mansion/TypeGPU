import type { ResolvedSnippet } from '../../data/snippet.ts';
import { $internal } from '../../shared/symbols.ts';
import { ShelllessRepository } from '../../tgsl/shellless.ts';
import type { TgpuBindGroupLayout } from '../../tgpuBindGroupLayout.ts';
import type { TgpuLazy, TgpuSlot } from '../slot/slotTypes.ts';
import type { FixedBindingConfig } from './bindingUse.ts';
import type { ProbeSets } from './probe.ts';

type SlotToValueMap = Map<TgpuSlot<unknown>, unknown>;

export interface NamespaceInternal {
  /**
   * Global identifiers taken by resolved items. Reserved WGSL words are checked separately,
   * so that creating a namespace doesn't have to copy them.
   */
  readonly takenGlobalIdentifiers: Set<string>;
  readonly shelllessRepo: ShelllessRepository;
  readonly strategy: 'random' | 'strict';
  readonly fixedBindings: FixedBindingConfig[];
  catchallGroupIndex: number | undefined;
  readonly automaticLayoutIndices: Map<TgpuBindGroupLayout, number>;

  memoizedResolves: WeakMap<
    // WeakMap because if the item does not exist anymore,
    // apart from this map, there is no way to access the cached value anyway.
    object,
    { slotToValueMap: SlotToValueMap; result: ResolvedSnippet; probes?: ProbeSets | undefined }[]
  >;

  memoizedLazy: WeakMap<
    // WeakMap because if the "lazy" does not exist anymore,
    // apart from this map, there is no way to access the cached value anyway.
    TgpuLazy<unknown>,
    { slotToValueMap: SlotToValueMap; result: unknown }[]
  >;
}

export interface Namespace {
  readonly [$internal]: NamespaceInternal;
}

class NamespaceImpl implements Namespace {
  readonly [$internal]: NamespaceInternal;

  constructor(strategy: 'random' | 'strict') {
    this[$internal] = {
      strategy,
      fixedBindings: [],
      catchallGroupIndex: undefined,
      automaticLayoutIndices: new Map(),
      takenGlobalIdentifiers: new Set(),
      shelllessRepo: new ShelllessRepository(),
      memoizedResolves: new WeakMap(),
      memoizedLazy: new WeakMap(),
    };
  }
}

export interface NamespaceOptions {
  names?: 'random' | 'strict' | undefined;
}

export function namespace(options?: NamespaceOptions): Namespace {
  const { names = 'strict' } = options ?? {};

  return new NamespaceImpl(names);
}
