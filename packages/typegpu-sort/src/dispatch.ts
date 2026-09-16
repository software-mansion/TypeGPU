import { d } from 'typegpu';

const MAX_WORKGROUPS_PER_DIMENSION = 65535;

/**
 * Decomposes a total workgroup count into a 3D dispatch grid (x, y, z),
 * respecting the WebGPU limit of 65535 workgroups per dimension. The grid can cover more
 * workgroups than requested, so kernels have to guard against running past their data.
 */
export function decomposeWorkgroups(total: number): [number, number, number] {
  if (total <= 1) {
    return [1, 1, 1];
  }

  const x = Math.min(total, MAX_WORKGROUPS_PER_DIMENSION);
  const rows = Math.ceil(total / x);
  const y = Math.min(rows, MAX_WORKGROUPS_PER_DIMENSION);

  return [x, y, Math.ceil(rows / y)];
}

export const dispatchIn = {
  lid: d.builtin.localInvocationId,
  wid: d.builtin.workgroupId,
  numWorkgroups: d.builtin.numWorkgroups,
} as const;

export function flatWorkgroupIndex(wid: d.v3u, numWorkgroups: d.v3u): number {
  'use gpu';
  return wid.x + wid.y * numWorkgroups.x + wid.z * numWorkgroups.x * numWorkgroups.y;
}
