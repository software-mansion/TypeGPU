import tgpu from 'typegpu';
import * as d from 'typegpu/data';
import * as std from 'typegpu/std';
import { lightDirection, lightPosition } from './params.ts';
import {
  VertexOutput,
  computeBindGroupLayout,
  renderBindGroupLayout,
} from './schemas.ts';

export const EXT = renderBindGroupLayout.bound;
const extCelestialBody = computeBindGroupLayout.bound;

export const mainVertex = tgpu['~unstable']
  .vertexFn({
    in: {
      position: d.vec4f,
      normal: d.vec3f,
      uv: d.vec2f,
      instanceIdx: d.builtin.instanceIndex,
    },
    out: VertexOutput,
  })
  .does((input) => {
    const camera = EXT.camera.value;
    const object = extCelestialBody.inState.value[input.instanceIdx];
    const worldPosition = std.add(input.position, d.vec4f(object.position, 1));
    const relativeToCamera = std.mul(camera.view, worldPosition);
    return {
      position: std.mul(camera.projection, relativeToCamera),
      uv: input.uv,
      normals: input.normal,
      worldPosition: worldPosition.xyz,
    };
  })
  .$name('mainVertex');

export const mainFragment = tgpu['~unstable']
  .fragmentFn({
    in: VertexOutput,
    out: d.vec4f,
  })
  .does((input) => {
    const normal = std.normalize(input.normals);
    // Directional lighting
    const directionalLightIntensity = std.max(
      std.dot(normal, lightDirection),
      0.0,
    );
    const directionalComponent = 0.3 * directionalLightIntensity;

    // Point Lighting
    const surfaceToLight = std.normalize(
      std.sub(lightPosition, input.worldPosition),
    );
    const pointLightIntensity = std.max(std.dot(normal, surfaceToLight), 0.0);
    const pointComponent = 0.6 * pointLightIntensity;

    const lighting = directionalComponent + pointComponent;
    const albedo = d.vec3f(1.0, 1.0, 1.0); // base color

    const cameraPos = EXT.camera.value.position;
    const surfaceToCamera = std.normalize(
      std.sub(EXT.camera.value.position, input.worldPosition),
    );

    const halfVector = std.normalize(std.add(surfaceToLight, surfaceToCamera));
    const specular = std.pow(std.max(std.dot(normal, halfVector), 0.0), 0.5);

    return d.vec4f(
      albedo.x * lighting * specular,
      albedo.y * lighting * specular,
      albedo.z * lighting * specular,
      1,
    );
  })
  .$name('mainFragment');

// const sampleTexture = tgpu['~unstable']
//   .fn([d.vec2f], d.vec4f)
//   .does(/*wgsl*/ `(uv: vec2<f32>) -> vec4<f32> {
//         return textureSample(EXT.texture, EXT.sampler, uv);
//     }`)
//   .$uses({ EXT })
//   .$name('sampleShader');
