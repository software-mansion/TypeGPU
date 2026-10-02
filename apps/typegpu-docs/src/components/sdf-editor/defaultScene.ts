export const defaultScene = `import { tgpu, d, std } from 'typegpu';
import { sdSphere, sdBox3d } from '@typegpu/sdf';

const Surface = d.struct({ dist: d.f32, color: d.vec3f });

// Return the signed distance and surface color at a world-space point.
// The preview supplies time in seconds.
export const scene = tgpu.fn([d.vec3f, d.f32], Surface)((p, time) => {
  'use gpu';
  const sphere = sdSphere(p - d.vec3f(-0.65, 1.05, 0), 0.85);
  const boxPosition = p - d.vec3f(0.7, 0.9, 0);
  const angle = time * 0.35;
  const c = std.cos(angle);
  const s = std.sin(angle);
  const rotated = d.vec3f(
    c * boxPosition.x - s * boxPosition.z,
    boxPosition.y,
    s * boxPosition.x + c * boxPosition.z,
  );
  const box = sdBox3d(rotated, d.vec3f(0.65)) - 0.12;

  // Smooth union, blending both distance and material.
  const blend = std.clamp(0.5 + 0.5 * (box - sphere) / 0.5, 0, 1);
  const objectDistance = std.mix(box, sphere, blend)
    - 0.5 * blend * (1 - blend);
  const objectColor = std.mix(
    d.vec3f(0.95, 0.35, 0.12),
    d.vec3f(0.22, 0.35, 0.85),
    blend,
  );

  // Ground plane. Remove this branch for a floating scene.
  if (p.y < objectDistance) {
    const checker = std.abs(std.floor(p.x) + std.floor(p.z)) % 2;
    return Surface({
      dist: p.y,
      color: std.mix(d.vec3f(0.42), d.vec3f(0.55), checker),
    });
  }
  return Surface({ dist: objectDistance, color: objectColor });
});
`;
