import { tgpu, d } from 'typegpu';

export const flatWorkgroupIndex = tgpu.fn(
  [d.vec3u, d.vec3u],
  d.u32,
)(
  (wid, numWorkgroups) =>
    wid.x + wid.y * numWorkgroups.x + wid.z * numWorkgroups.x * numWorkgroups.y,
);
