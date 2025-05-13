import { hsvToRgb, rgbToHsv } from '@typegpu/color';
import tgpu from 'typegpu';
import * as d from 'typegpu/data';
import * as std from 'typegpu/std';
import * as p from './params.ts';
import {
  ModelVertexInput,
  ModelVertexOutput,
  renderBindGroupLayout as layout,
} from './schemas.ts';
import { applySinWave, PosAndNormal } from './tgsl-helpers.ts';

export const vertexShader = tgpu['~unstable']
  .vertexFn({
    in: { ...ModelVertexInput, instanceIndex: d.builtin.instanceIndex },
    out: ModelVertexOutput,
  })((input) => {
    // rotate the model so that it aligns with model's direction of movement
    // https://simple.wikipedia.org/wiki/Pitch,_yaw,_and_roll
    const currentModelData = layout.$.modelData[input.instanceIndex];

    // apply sin wave

    let wavedVertex = PosAndNormal({
      position: input.modelPosition,
      normal: input.modelNormal,
    });
    if (currentModelData.applySinWave === 1) {
      wavedVertex = applySinWave(
        input.instanceIndex,
        PosAndNormal({
          position: input.modelPosition,
          normal: input.modelNormal,
        }),
        layout.$.currentTime,
      );
    }

    // rotate model

    const direction = std.normalize(currentModelData.direction);

    const yaw = std.atan2(direction.z, direction.x) + Math.PI;
    // deno-fmt-ignore
    const yawMatrix = d.mat3x3f(
      std.cos(yaw),  0, std.sin(yaw),
      0,             1, 0,           
      -std.sin(yaw), 0, std.cos(yaw),
    );

    const pitch = -std.asin(-direction.y);
    // deno-fmt-ignore
    const pitchMatrix = d.mat3x3f(
      std.cos(pitch), -std.sin(pitch), 0,
      std.sin(pitch), std.cos(pitch),  0,
      0,              0,               1,
    );

    const worldPosition = std.add(
      std.mul(
        yawMatrix,
        std.mul(
          pitchMatrix,
          std.mul(currentModelData.scale, wavedVertex.position),
        ),
      ),
      currentModelData.position,
    );

    // calculate where the normal vector points to
    const worldNormal = std.normalize(
      std.mul(pitchMatrix, std.mul(yawMatrix, wavedVertex.normal)),
    );

    // project the world position into the camera
    const worldPositionUniform = d.vec4f(worldPosition.xyz, 1);
    const canvasPosition = std.mul(
      layout.$.camera.projection,
      std.mul(layout.$.camera.view, worldPositionUniform),
    );

    return {
      canvasPosition: canvasPosition,
      textureUV: input.textureUV,
      worldNormal: worldNormal,
      worldPosition: worldPosition,
      applySeaFog: currentModelData.applySeaFog,
      applySeaDesaturation: currentModelData.applySeaDesaturation,
      variant: currentModelData.variant,
    };
  })
  .$name('vertexShader');

const sampleTexture = tgpu['~unstable'].fn(
  [d.vec2f],
  d.vec4f,
) /* wgsl */`(uv: vec2f) -> vec4f {
  return textureSample(layout.$.modelTexture, layout.$.sampler, uv);
}
`.$uses({ layout });

export const fragmentShader = tgpu['~unstable']
  .fragmentFn({
    in: ModelVertexOutput,
    out: d.vec4f,
  })((input) => {
    // shade the fragment in Phong reflection model
    // https://en.wikipedia.org/wiki/Phong_reflection_model
    // then apply sea fog and sea desaturation

    const textureColorWithAlpha = sampleTexture(input.textureUV); // base color
    const textureColor = textureColorWithAlpha.xyz;

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
      16,
    );
    const specular = std.mul(specularStrength, p.lightColor);

    const lightedColor = std.add(ambient, std.add(diffuse, specular));

    // apply desaturation
    const distanceFromCamera = std.length(
      std.sub(layout.$.camera.position.xyz, input.worldPosition),
    );

    let desaturatedColor = lightedColor;
    if (input.applySeaDesaturation === 1) {
      const desaturationFactor = -std.atan2((distanceFromCamera - 5) / 10, 1) /
        3;
      const hsv = rgbToHsv(desaturatedColor);
      hsv.y += desaturationFactor / 2;
      hsv.z += desaturationFactor;
      // Hue shift
      hsv.x += (input.variant - 0.5) * 0.2;
      desaturatedColor = hsvToRgb(hsv);
    }

    let foggedColor = desaturatedColor;
    if (input.applySeaFog === 1) {
      const fogParameter = std.max(0, (distanceFromCamera - 1.5) * 0.2);
      const fogFactor = fogParameter / (1 + fogParameter);
      foggedColor = std.mix(foggedColor, p.backgroundColor, fogFactor);
    }

    return d.vec4f(foggedColor.xyz, 1);
  })
  .$name('fragmentShader');
