import tgpu from 'typegpu';
import * as d from 'typegpu/data';
import * as std from 'typegpu/std';
import * as p from './params';
import {
  ModelVertexInput,
  ModelVertexOutput,
  renderBindGroupLayout,
} from './schemas';
import { hsvToRgb, rgbToHsv } from './tgsl-helpers';

const { camera, modelTexture, sampler, modelData } =
  renderBindGroupLayout.bound;

export const vertexShader = tgpu['~unstable']
  .vertexFn({
    in: { ...ModelVertexInput, instanceIndex: d.builtin.instanceIndex },
    out: ModelVertexOutput,
  })
  .does((input) => {
    // rotate the model so that it aligns with model's direction of movement
    // https://simple.wikipedia.org/wiki/Pitch,_yaw,_and_roll
    const currentModelData = modelData.value[input.instanceIndex];

    const modelPosition = input.modelPosition;

    const direction = std.normalize(currentModelData.direction);

    const yaw = std.atan2(direction.z, direction.x) + Math.PI;
    // biome-ignore format:
    const yawMatrix = d.mat3x3f(
      std.cos(yaw),  0, std.sin(yaw),
      0,             1, 0,           
      -std.sin(yaw), 0, std.cos(yaw),
    );

    const pitch = -std.asin(-direction.y);
    // biome-ignore format:
    const pitchMatrix = d.mat3x3f(
      std.cos(pitch), -std.sin(pitch), 0,
      std.sin(pitch), std.cos(pitch),  0,
      0,              0,               1,
    );

    const worldPosition = std.add(
      std.mul(
        yawMatrix,
        std.mul(pitchMatrix, std.mul(currentModelData.scale, modelPosition)),
      ),
      currentModelData.position,
    );

    // calculate where the normal vector points to
    const worldNormal = std.normalize(
      std.mul(pitchMatrix, std.mul(yawMatrix, input.modelNormal)),
    );

    // project the world position into the camera
    const worldPositionUniform = d.vec4f(worldPosition.xyz, 1);
    const canvasPosition = std.mul(
      camera.value.projection,
      std.mul(camera.value.view, worldPositionUniform),
    );

    return {
      canvasPosition: canvasPosition,
      textureUV: input.textureUV,
      worldNormal: worldNormal,
      worldPosition: worldPosition,
      applySeaFog: currentModelData.applySeaFog,
      applySeaDesaturation: currentModelData.applySeaDesaturation,
    };
  })
  .$name('vertex shader');

const sampleTexture = tgpu['~unstable']
  .fn([d.vec2f], d.vec4f)
  .does(/* wgsl */ `(uv: vec2f) -> vec4f {
    return textureSample(shaderTexture, shaderSampler, uv);
  }`)
  .$uses({ shaderTexture: modelTexture, shaderSampler: sampler })
  .$name('sampleShader');

export const fragmentShader = tgpu['~unstable']
  .fragmentFn({
    in: ModelVertexOutput,
    out: d.vec4f,
  })
  .does((input) => {
    // shade the fragment in Phong reflection model
    // https://en.wikipedia.org/wiki/Phong_reflection_model
    // then apply sea fog and sea desaturation

    const viewDirection = std.normalize(
      std.sub(camera.value.position.xyz, input.worldPosition),
    );
    const textureColorWithAlpha = sampleTexture(input.textureUV); // base color
    const textureColor = textureColorWithAlpha.xyz;

    let diffuse = d.vec3f();
    let specular = d.vec3f();
    const ambient = std.mul(0.5, std.mul(textureColor, p.lightColor));

    const cosTheta = std.max(0.0, std.dot(input.worldNormal, p.lightDirection));
    if (cosTheta > 0) {
      diffuse = std.mul(cosTheta, std.mul(textureColor, p.lightColor));

      const reflectionDirection = std.reflect(
        std.mul(-1, p.lightDirection),
        input.worldNormal,
      );

      specular = std.mul(
        0.5,
        std.mul(
          textureColor,
          std.mul(std.dot(reflectionDirection, viewDirection), p.lightColor),
        ),
      );
    }

    const lightedColor = std.add(ambient, std.add(diffuse, specular));

    const distanceFromCamera = std.length(
      std.sub(camera.value.position.xyz, input.worldPosition),
    );

    let desaturatedColor = lightedColor;
    if (input.applySeaDesaturation === 1) {
      const desaturationFactor =
        -std.atan2((distanceFromCamera - 5) / 10, 1) / 3;
      const hsv = rgbToHsv(desaturatedColor);
      hsv.y += desaturationFactor / 2;
      hsv.z += desaturationFactor;
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
  .$name('fragment shader');
