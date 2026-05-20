import type { ResolvedSnippet } from '../../data/snippet.ts';
import { bannedTokens, builtins } from '../../nameUtils.ts';
import { $internal } from '../../shared/symbols.ts';
import { ShelllessRepository } from '../../tgsl/shellless.ts';
import type { TgpuLazy, TgpuSlot } from '../slot/slotTypes.ts';

type SlotToValueMap = Map<TgpuSlot<unknown>, unknown>;

export interface NamespaceInternal {
  readonly takenGlobalIdentifiers: Set<string>;
  readonly shelllessRepo: ShelllessRepository;
  readonly strategy: 'random' | 'strict';

  memoizedResolves: WeakMap<
    // WeakMap because if the item does not exist anymore,
    // apart from this map, there is no way to access the cached value anyway.
    object,
    { slotToValueMap: SlotToValueMap; result: ResolvedSnippet }[]
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
      takenGlobalIdentifiers: new Set([...bannedTokens, ...builtins]),
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
