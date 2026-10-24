import type { ResolvedSnippet } from '../../data/snippet.ts';
import { bannedTokens, builtins, templateEnumerants } from '../../nameUtils.ts';
import { $internal } from '../../shared/symbols.ts';
import { ShelllessRepository } from '../../tgsl/shellless.ts';
import type { InstanceMap } from '../slot/slotScope.ts';
import type { TgpuLazy } from '../slot/slotTypes.ts';

export interface NamespaceInternal {
  readonly takenGlobalIdentifiers: Set<string>;
  readonly shelllessRepo: ShelllessRepository;
  readonly strategy: 'random' | 'strict';

  // InstanceMap is a WeakMap, because if the item does not exist anymore,
  // apart from this map, there is no way to access its instances anyway.
  resolvedInstances: InstanceMap<object, ResolvedSnippet>;
  lazyInstances: InstanceMap<TgpuLazy<unknown>, unknown>;
}

export interface Namespace {
  readonly [$internal]: NamespaceInternal;
}

class NamespaceImpl implements Namespace {
  readonly [$internal]: NamespaceInternal;

  constructor(strategy: 'random' | 'strict') {
    this[$internal] = {
      strategy,
      takenGlobalIdentifiers: new Set([...bannedTokens, ...builtins, ...templateEnumerants]),
      shelllessRepo: new ShelllessRepository(),
      resolvedInstances: new WeakMap(),
      lazyInstances: new WeakMap(),
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
