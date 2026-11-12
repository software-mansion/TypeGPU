import { d, tgpu } from 'typegpu';
import { cameraAccess, scene } from './scene.ts';

export const geometryVertexFn = tgpu.vertexFn({
  in: { vId: d.builtin.vertexIndex },
  out: { pos: d.builtin.position, scenePosition: d.vec3f, albedo: d.vec3f, normal: d.vec3f },
})(({ vId }) => {
  'use gpu';
  const info = scene.vertexAt(vId);

  const pos = cameraAccess.$.projection * cameraAccess.$.view * d.vec4f(info.position, 1);

  return {
    pos,
    scenePosition: info.position,
    albedo: info.color,
    normal: info.normal,
  };
});

export const geometryFragmentFn = tgpu.fragmentFn({
  in: { scenePosition: d.vec3f, albedo: d.vec3f, normal: d.vec3f },
  out: { position: d.vec4f, normal: d.vec4f, albedo: d.vec4f },
})(({ scenePosition, normal, albedo }) => {
  return {
    position: d.vec4f(scenePosition, 0),
    normal: d.vec4f(normal, 0),
    albedo: d.vec4f(albedo, 0),
  };
});
