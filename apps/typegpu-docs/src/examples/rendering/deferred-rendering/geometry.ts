import { d, tgpu } from 'typegpu';
import { scene } from './scene.ts';
import { cameraAccess } from './slots.ts';

export const geometryVertexFn = tgpu.vertexFn({
  in: { vId: d.builtin.vertexIndex },
  out: { pos: d.builtin.position, scenePosition: d.vec3f, material: d.vec4f, normal: d.vec3f },
})(({ vId }) => {
  'use gpu';
  const info = scene.vertexAt(vId);

  const pos = cameraAccess.$.projection * cameraAccess.$.view * d.vec4f(info.position, 1);

  return {
    pos,
    scenePosition: info.position,
    material: info.material,
    normal: info.normal,
  };
});

export const geometryFragmentFn = tgpu.fragmentFn({
  in: { scenePosition: d.vec3f, material: d.vec4f, normal: d.vec3f },
  out: { position: d.vec4f, normal: d.vec4f, material: d.vec4f },
})(({ scenePosition, normal, material }) => {
  return {
    position: d.vec4f(scenePosition, 0),
    normal: d.vec4f(normal, 0),
    material,
  };
});
