import { installWebGPU } from 'react-native-webgpu';
import { isWorkletFunction, registerCustomSerializable } from 'react-native-worklets';
import {
  isNonTransferableResource,
  isSnapshotableResource,
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

export type PackedTgpuResource = {
  id: number;
  snapshot: TgpuResourceSnapshot;
};

let registered = false;

export function registerTypegpuReactSerializables(): void {
  if (registered) {
    return;
  }
  registered = true;

  registerCustomSerializable({
    name: 'TypeGPU',
    determine(value: object): value is object {
      'worklet';
      // Non-transferable TypeGPU objects are claimed too, so pack() fails loudly
      return isSnapshotableResource(value) || isNonTransferableResource(value);
    },
    pack(value: object): PackedTgpuResource {
      'worklet';
      const snapshot = snapshotResource(value);
      if (!snapshot) {
        const resourceType = (value as { resourceType?: string }).resourceType ?? 'unknown';
        throw new Error(
          `[typegpu-react] TypeGPU object '${resourceType}' cannot be transferred to a worklet. ` +
            'Definitions (functions, comptime, derived) are runtime-local: import them from a module ' +
            'covered by importForwarding, or build pipelines on the JS thread and transfer the result.',
        );
      }
      for (const [key, field] of Object.entries(snapshot)) {
        if (
          typeof field === 'function' &&
          !isWorkletFunction(field) &&
          !(field as { __bundleData?: unknown }).__bundleData
        ) {
          throw new Error(
            `[typegpu-react] Cannot transfer '${snapshot.type}': its '${key}' is a plain function. ` +
              "Only worklets can cross runtimes - mark it with 'worklet'. If it is a schema or " +
              'TypeGPU definition, it cannot be transferred yet.',
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
