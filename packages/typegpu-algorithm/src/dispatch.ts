import { d } from 'typegpu';

export const dispatchIn = {
  lid: d.builtin.localInvocationId,
  wid: d.builtin.workgroupId,
  numWorkgroups: d.builtin.numWorkgroups,
} as const;

export function flatWorkgroupIndex(wid: d.v3u, numWorkgroups: d.v3u): number {
  'use gpu';
  return wid.x + wid.y * numWorkgroups.x + wid.z * numWorkgroups.x * numWorkgroups.y;
}
