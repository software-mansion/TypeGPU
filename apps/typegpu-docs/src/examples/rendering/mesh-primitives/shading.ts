import { d, std, tgpu } from 'typegpu';
import { Camera } from '../../common/setup-orbit-camera.ts';

const Light = d.struct({ viewProj: d.mat4x4f, direction: d.vec3f });

export const SceneUniforms = d.struct({ camera: Camera, light: Light, time: d.f32 });
export const sceneLayout = tgpu.bindGroupLayout({ uniforms: { uniform: SceneUniforms } });

export const shadowLayout = tgpu.bindGroupLayout({
  map: { texture: d.textureDepth2d() },
  sampler: { sampler: 'comparison' },
});

export function worldToClip(position: d.v3f) {
  'use gpu';
  const camera = sceneLayout.$.uniforms.camera;
  return camera.projection * camera.view * d.vec4f(position, 1);
}

export function worldToLight(position: d.v3f) {
  'use gpu';
  return sceneLayout.$.uniforms.light.viewProj * d.vec4f(position, 1);
}

function shadowAt(position: d.v3f, normal: d.v3f) {
  'use gpu';
  const clip = worldToLight(position + normal * 0.03);
  const uv = clip.xy * d.vec2f(0.5, -0.5) + 0.5;

  return std.textureSampleCompare(shadowLayout.$.map, shadowLayout.$.sampler, uv, clip.z);
}

export const fragment = tgpu.fragmentFn({
  in: { worldPos: d.vec3f, normal: d.vec3f, color: d.vec3f },
  out: d.vec4f,
})(({ worldPos, normal, color }) => {
  'use gpu';
  const n = std.normalize(normal);
  const toLight = std.neg(sceneLayout.$.uniforms.light.direction);
  const diffuse = std.max(std.dot(n, toLight), 0) * shadowAt(worldPos, n);
  const sky = n.y * 0.5 + 0.5;

  return d.vec4f(color * (0.2 + 0.25 * sky + 0.6 * diffuse), 1);
});
