import { installWebGPU } from 'react-native-webgpu';
import {
  isNonTransferableResource,
  isTransferableResource,
  restoreResource,
  snapshotResource,
  type TgpuResourceSnapshot,
} from 'typegpu/~internal';
import {
  cacheTransferredResource,
  getCachedTransferredResource,
  getOrCreateTransferId,
  getTransferredRoot,
} from './transfer-cache.ts';
import { getWorkletsModule } from '../worklets-integration.ts';

export type PackedTgpuResource = {
  id: string;
  snapshot: TgpuResourceSnapshot;
};

/** Inlined isWorkletFunction, the lazily resolved module cannot be captured in a worklet */
function isHostCarriedFunction(value: unknown): boolean {
  'worklet';
  return (
    typeof value === 'function' &&
    (!!(value as { __workletHash?: unknown }).__workletHash ||
      !!(value as { __bundleData?: unknown }).__bundleData)
  );
}

let registered = false;

export function registerTypegpuReactSerializables(): void {
  if (registered) {
    return;
  }
  const worklets = getWorkletsModule();
  if (!worklets) {
    return;
  }
  registered = true;

  worklets.registerCustomSerializable({
    name: 'TypeGPU',
    determine(value: object): value is object {
      'worklet';
      if (isTransferableResource(value)) {
        return true;
      }
      // Non-transferable TypeGPU objects are claimed too, so pack() fails loudly
      return isNonTransferableResource(value);
    },
    pack(value: object): PackedTgpuResource {
      'worklet';
      const snapshot = snapshotResource(value);
      if (!snapshot) {
        const resourceType = (value as { resourceType?: string }).resourceType ?? 'unknown';
        throw new Error(
          `[typegpu-react] TypeGPU resource '${resourceType}' cannot be transferred to a worklet because this resource type is not supported.`,
        );
      }
      for (const [key, field] of Object.entries(snapshot)) {
        if (typeof field === 'function' && !isHostCarriedFunction(field)) {
          throw new Error(
            `[typegpu-react] Cannot transfer '${snapshot.type}': its '${key}' is a plain function. ` +
              "Only worklets can cross runtimes - mark it with 'worklet'.",
          );
        }
      }
      return { id: getOrCreateTransferId(value), snapshot };
    },
    unpack(payload: PackedTgpuResource): object {
      'worklet';
      try {
        const cached = getCachedTransferredResource(payload.id);
        if (cached) {
          return cached;
        }

        installWebGPU();
        const resource = restoreResource(payload.snapshot, {
          getRoot: getTransferredRoot,
        }) as object;
        cacheTransferredResource(payload.id, resource);
        return resource;
      } catch (err) {
        const details = err instanceof Error ? (err.stack ?? err.message) : String(err);
        throw new Error(
          `[typegpu-react] Failed to restore '${payload?.snapshot?.type}' (id ${payload?.id}). Cause: ${details}`,
          { cause: err },
        );
      }
    },
  });
}
