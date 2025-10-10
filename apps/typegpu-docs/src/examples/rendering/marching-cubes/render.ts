import { hsvToRgb, rgbToHsv } from '@typegpu/color';
import tgpu from 'typegpu';
import * as d from 'typegpu/data';
import * as p from './params.ts';
import * as std from 'typegpu/std';
import {
  ModelVertexInput,
  ModelVertexOutput,
  renderBindGroupLayout as layout,
} from './schemas.ts';

export const vertexShader = tgpu['~unstable'].vertexFn({
  in: { ...ModelVertexInput.propTypes, instanceIndex: d.builtin.instanceIndex },
  out: ModelVertexOutput,
})((input) => {
  const worldPosition = d.vec4f(input.modelPosition, 1);
  const camera = layout.$.camera;

  const canvasPosition = std.mul(
    camera.projection,
    std.mul(camera.view, worldPosition),
  );

  return {
    worldPosition: input.modelPosition,
    worldNormal: input.modelNormal,
    canvasPosition: canvasPosition,
  };
});

export const fragmentShader = tgpu['~unstable'].fragmentFn({
  in: ModelVertexOutput,
  out: d.vec4f,
})((input) => {
  // shade the fragment in Phong reflection model
  // https://en.wikipedia.org/wiki/Phong_reflection_model
  // then apply sea fog and sea desaturation
  const textureColor = d.vec3f(0.8, 0.8, 0.1);

  const ambient = std.mul(0.5, std.mul(textureColor, p.lightColor));

  const cosTheta = std.dot(input.worldNormal, p.lightDirection);
  const diffuse = std.mul(
    std.max(0, cosTheta),
    std.mul(textureColor, p.lightColor),
  );

  const viewSource = std.normalize(
    std.sub(layout.$.camera.position.xyz, input.worldPosition),
  );
  const reflectSource = std.normalize(
    std.reflect(std.mul(-1, p.lightDirection), input.worldNormal),
  );
  const specularStrength = std.pow(
    std.max(0, std.dot(viewSource, reflectSource)),
    5,
  );
  const specular = std.mul(specularStrength * 0.2, p.lightColor);

  const lightedColor = std.add(ambient, std.add(diffuse, specular));

  return d.vec4f(lightedColor, 1);
});
