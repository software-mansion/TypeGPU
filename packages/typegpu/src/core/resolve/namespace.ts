import type { ResolvedSnippet } from '../../data/snippet.ts';
import {
  type NameRegistry,
  RandomNameRegistry,
  StrictNameRegistry,
} from '../../nameRegistry.ts';
import { getName } from '../../shared/meta.ts';
import { $internal } from '../../shared/symbols.ts';
import { ShelllessRepository } from '../../tgsl/shellless.ts';
import type { TgpuLazy, TgpuSlot } from '../slot/slotTypes.ts';

type SlotToValueMap = Map<TgpuSlot<unknown>, unknown>;

export interface NamespaceInternal {
  readonly nameRegistry: NameRegistry;
  readonly shelllessRepo: ShelllessRepository;

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

  listeners: {
    [K in keyof NamespaceEventMap]: Set<(event: NamespaceEventMap[K]) => void>;
  };
}

type NamespaceEventMap = {
  'name': { target: object; name: string };
};

type DetachListener = () => void;

export interface Namespace {
  readonly [$internal]: NamespaceInternal;

  on<TEvent extends keyof NamespaceEventMap>(
    event: TEvent,
    listener: (event: NamespaceEventMap[TEvent]) => void,
  ): DetachListener;
}

class NamespaceImpl implements Namespace {
  readonly [$internal]: NamespaceInternal;

  constructor(nameRegistry: NameRegistry) {
    this[$internal] = {
      nameRegistry,
      shelllessRepo: new ShelllessRepository(),
      memoizedResolves: new WeakMap(),
      memoizedLazy: new WeakMap(),
      listeners: {
        name: new Set(),
      },
    };
  }

  on<TEvent extends keyof NamespaceEventMap>(
    event: TEvent,
    listener: (event: NamespaceEventMap[TEvent]) => void,
  ): DetachListener {
    if (event === 'name') {
      const listeners = this[$internal].listeners.name;
      listeners.add(listener);

      return () => listeners.delete(listener);
    }

    throw new Error(`Unsupported event: ${event}`);
  }
}

export interface NamespaceOptions {
  names?: 'random' | 'strict' | undefined;
}

export function getUniqueName(
  namespace: NamespaceInternal,
  resource: object,
): string {
  const name = namespace.nameRegistry.makeUnique(getName(resource), true);
  for (const listener of namespace.listeners.name) {
    listener({ target: resource, name });
  }
  return name;
}

export function namespace(options?: NamespaceOptions): Namespace {
  const { names = 'strict' } = options ?? {};

  return new NamespaceImpl(
    names === 'strict' ? new StrictNameRegistry() : new RandomNameRegistry(),
  );
}
