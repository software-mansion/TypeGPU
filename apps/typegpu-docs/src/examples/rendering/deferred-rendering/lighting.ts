import { d, std, tgpu } from 'typegpu';
import { layout } from './gBuffer.ts';
import { cameraAccess } from './slots.ts';

function phong(albedo: d.v3f, specular: number, position: d.v3f, normal: d.v3f): d.v4f {
  'use gpu';
  const lightColor = d.vec3f(1, 0.9, 0.7);
  const lightDirection = std.normalize(d.vec3f(1, 1, 1));

  // ambient component
  const ambient = albedo * 0.5;

  // diffuse component
  const cosTheta = std.dot(normal, lightDirection);
  const diffuse = albedo * lightColor * std.max(0, cosTheta);

  // specular component
  const reflectionDirection = std.reflect(-1 * lightDirection, normal);
  const viewDirection = std.normalize(cameraAccess.$.pos.xyz - position);
  const specularLight =
    lightColor * std.pow(std.max(0, std.dot(reflectionDirection, viewDirection)), 64) * specular;

  const color = ambient + diffuse + specularLight;
  return d.vec4f(color, 1);
}

export const lightingFragmentFn = tgpu.fragmentFn({
  in: { position: d.builtin.position, uv: d.vec2f },
  out: d.vec4f,
})(({ position }) => {
  const pixel = d.vec2i(position.xy);
  const material = std.textureLoad(layout.$.material, pixel, 0);
  const albedo = material.xyz;
  const specular = material.w;
  const scenePosition = std.textureLoad(layout.$.position, pixel, 0).xyz;
  const normal = std.textureLoad(layout.$.normal, pixel, 0).xyz;

  if (std.allEq(normal, d.vec3f())) {
    // The G-buffer is empty, this pixel draws background.
    return d.vec4f(0.5, 0.5, 0.8, 1);
  }

  return phong(albedo, specular, scenePosition, std.normalize(normal));
});
