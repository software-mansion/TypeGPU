import { tgpu, type TgpuRoot } from 'typegpu';

export type TransferredResourceRef = {
  deref(): object | undefined;
};

type ResourceWeakRefConstructor = new <T extends object>(
  target: T,
) => {
  deref(): T | undefined;
};

type WeakRefGlobals = {
  WeakRef?: ResourceWeakRefConstructor;
};

type ResourceFinalizationRegistry = {
  register(target: object, heldValue: number): void;
};

type ResourceFinalizationRegistryConstructor = new (
  cleanup: (heldValue: number) => void,
) => ResourceFinalizationRegistry;

type TypegpuReactTransferGlobals = typeof globalThis & {
  __TYPEGPU_REACT_NEXT_TRANSFER_ID__?: number;
  __TYPEGPU_REACT_TRANSFER_IDS__?: WeakMap<object, number>;
  __TYPEGPU_REACT_TRANSFERRED_RESOURCES__?: Map<number, TransferredResourceRef>;
  __TYPEGPU_REACT_TRANSFER_CACHE_CLEANUP__?: ResourceFinalizationRegistry;
  __TYPEGPU_REACT_STRONG_TRANSFER_CACHE_WARNING_SHOWN__?: boolean;
  __TYPEGPU_REACT_ROOTS__?: WeakMap<GPUDevice, TgpuRoot>;
};

export function getTransferredRoot(device: GPUDevice): TgpuRoot {
  'worklet';
  const global = globalThis as TypegpuReactTransferGlobals;
  const roots = (global.__TYPEGPU_REACT_ROOTS__ ??= new WeakMap());
  let root = roots.get(device);
  if (!root) {
    root = tgpu.initFromDevice({ device });
    roots.set(device, root);
  }
  return root;
}

export function getOrCreateTransferId(value: object): number {
  'worklet';
  const global = globalThis as TypegpuReactTransferGlobals;
  const ids = (global.__TYPEGPU_REACT_TRANSFER_IDS__ ??= new WeakMap());
  let id = ids.get(value);
  if (id === undefined) {
    id = global.__TYPEGPU_REACT_NEXT_TRANSFER_ID__ ?? 0;
    global.__TYPEGPU_REACT_NEXT_TRANSFER_ID__ = id + 1;
    ids.set(value, id);
  }
  return id;
}

export function getTransferredResourceCache(): Map<number, TransferredResourceRef> {
  'worklet';
  const global = globalThis as TypegpuReactTransferGlobals;
  return (global.__TYPEGPU_REACT_TRANSFERRED_RESOURCES__ ??= new Map());
}

export function getCachedTransferredResource(id: number): object | undefined {
  'worklet';
  return getTransferredResourceCache().get(id)?.deref();
}

function getWeakRef(): ResourceWeakRefConstructor | undefined {
  'worklet';
  return (globalThis as unknown as WeakRefGlobals).WeakRef;
}

export function createTransferredResourceRef(resource: object): TransferredResourceRef {
  'worklet';
  const WeakRefCtor = getWeakRef();
  if (WeakRefCtor) {
    return new WeakRefCtor(resource);
  }

  const global = globalThis as TypegpuReactTransferGlobals;
  if (!global.__TYPEGPU_REACT_STRONG_TRANSFER_CACHE_WARNING_SHOWN__) {
    global.__TYPEGPU_REACT_STRONG_TRANSFER_CACHE_WARNING_SHOWN__ = true;
    console.warn(
      'WeakRef is not available in this worklet runtime. TypeGPU transferred resources will use a strong identity cache.',
    );
  }

  return { deref: () => resource };
}

function getCacheCleanupRegistry(): ResourceFinalizationRegistry | undefined {
  'worklet';
  const FinalizationRegistryCtor = (
    globalThis as { FinalizationRegistry?: ResourceFinalizationRegistryConstructor }
  ).FinalizationRegistry;
  if (!FinalizationRegistryCtor) {
    return undefined;
  }
  const global = globalThis as TypegpuReactTransferGlobals;
  return (global.__TYPEGPU_REACT_TRANSFER_CACHE_CLEANUP__ ??= new FinalizationRegistryCtor((id) => {
    const cache = getTransferredResourceCache();
    // The id may have been repopulated with a live resource in the meantime
    if (cache.get(id)?.deref() === undefined) {
      cache.delete(id);
    }
  }));
}

// The worklets babel plugin turns workletized declarations into `const`s initialized in source
// order, so functions captured by worklets here must be declared above their dependents
export function cacheTransferredResource(id: number, resource: object): void {
  'worklet';
  getTransferredResourceCache().set(id, createTransferredResourceRef(resource));
  getCacheCleanupRegistry()?.register(resource, id);
}
