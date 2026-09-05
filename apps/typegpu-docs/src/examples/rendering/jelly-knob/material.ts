import { d, std } from 'typegpu';

export const bottomReflectionMask = (position: d.v3f, normal: d.v3f, camera: d.v3f) => {
  'use gpu';
  // Restrict the dark reflection to the low, downward-curving edge facing the camera.
  const towardCamera = std.normalize(camera.xz.sub(position.xz));
  const front = std.smoothstep(0.45, 0.8, std.dot(normal.xz, towardCamera));
  const underside = std.smoothstep(0.03, 0.23, -normal.y);
  const bottom = 1 - std.smoothstep(0.015, 0.09, position.y);
  return front * underside * bottom;
};

export const jellyReflection = (position: d.v3f, normal: d.v3f, camera: d.v3f) => {
  'use gpu';
  const original = d.vec3f(std.saturate(position.y + 0.2));
  return std.mix(original, d.vec3f(0.002), bottomReflectionMask(position, normal, camera));
};
