/**
 * @vitest-environment jsdom
 */

import { describe, expect } from 'vitest';
import { it } from '../../utils/extendedIt.ts';
import { runExampleTest, setupCommonMocks } from '../utils/baseTest.ts';
import {
  mockCreateImageBitmap,
  mockImageLoading,
  mockResizeObserver,
} from '../utils/commonMocks.ts';

describe('cubemap reflection example', () => {
  setupCommonMocks();

  it('should produce valid code', async ({ device }) => {
    const shaderCodes = await runExampleTest({
      category: 'rendering',
      name: 'cubemap-reflection',
      setupMocks: () => {
        mockImageLoading();
        mockCreateImageBitmap({ width: 2048, height: 2048 });
        mockResizeObserver();
      },
      expectedCalls: 3,
    }, device);

    expect(shaderCodes).toMatchInlineSnapshot(`
      "struct ComputeVertex {
        position: vec2u,
        normal: vec2u,
      }

      @group(0) @binding(0) var<storage, read> prevVertices: array<ComputeVertex>;

      fn unpackVec2u(packed: vec2u) -> vec4f {
        var xy = unpack2x16float(packed.x);
        var zw = unpack2x16float(packed.y);
        return vec4f(xy, zw);
      }

      fn calculateMidpoint(v1: vec4f, v2: vec4f) -> vec4f {
        return vec4f((0.5 * (v1.xyz + v2.xyz)), 1f);
      }

      @group(0) @binding(2) var<uniform> smoothFlag: u32;

      fn getAverageNormal(v1: vec4f, v2: vec4f, v3: vec4f) -> vec4f {
        var edge1 = (v2.xyz - v1.xyz);
        var edge2 = (v3.xyz - v1.xyz);
        return normalize(vec4f(cross(edge1, edge2), 0f));
      }

      @group(0) @binding(1) var<storage, read_write> nextVertices: array<ComputeVertex>;

      fn packVec2u(toPack: vec4f) -> vec2u {
        let xy = pack2x16float(toPack.xy);
        let zw = pack2x16float(toPack.zw);
        return vec2u(xy, zw);
      }

      struct computeFn_Input {
        @builtin(global_invocation_id) gid: vec3u,
      }

      @compute @workgroup_size(256, 1, 1) fn computeFn(input: computeFn_Input) {
        let triangleCount = u32((f32(arrayLength(&prevVertices)) / 3f));
        let triangleIndex = (input.gid.x + (input.gid.y * 65535u));
        if ((triangleIndex >= triangleCount)) {
          return;
        }
        let baseIndexPrev = (triangleIndex * 3u);
        var v1 = unpackVec2u(prevVertices[baseIndexPrev].position);
        var v2 = unpackVec2u(prevVertices[(baseIndexPrev + 1u)].position);
        var v3 = unpackVec2u(prevVertices[(baseIndexPrev + 2u)].position);
        var v12 = vec4f(normalize(calculateMidpoint(v1, v2).xyz), 1f);
        var v23 = vec4f(normalize(calculateMidpoint(v2, v3).xyz), 1f);
        var v31 = vec4f(normalize(calculateMidpoint(v3, v1).xyz), 1f);
        var newVertices = array<vec4f, 12>(v1, v12, v31, v2, v23, v12, v3, v31, v23, v12, v23, v31);
        let baseIndexNext = (triangleIndex * 12u);
        for (var i = 0u; (i < 12u); i++) {
          let reprojectedVertex = (&newVertices[i]);
          let triBase = (i - (i % 3u));
          var normal = (*reprojectedVertex);
          if ((smoothFlag == 0u)) {
            normal = getAverageNormal(newVertices[triBase], newVertices[(triBase + 1u)], newVertices[(triBase + 2u)]);
          }
          let outIndex = (baseIndexNext + i);
          let nextVertex = (&nextVertices[outIndex]);
          (*nextVertex).position = packVec2u((*reprojectedVertex));
          (*nextVertex).normal = packVec2u(normal);
        }
      }

      struct Camera {
        view: mat4x4f,
        projection: mat4x4f,
        position: vec4f,
      }

      @group(0) @binding(0) var<uniform> camera: Camera;

      struct cubeVertexFn_Output {
        @builtin(position) pos: vec4f,
        @location(0) texCoord: vec3f,
      }

      struct cubeVertexFn_Input {
        @location(0) position: vec3f,
        @location(1) uv: vec2f,
      }

      @vertex fn cubeVertexFn(input: cubeVertexFn_Input) -> cubeVertexFn_Output {
        var viewPos = (camera.view * vec4f(input.position.xyz, 0f)).xyz;
        return cubeVertexFn_Output((camera.projection * vec4f(viewPos, 1f)), input.position.xyz);
      }

      @group(1) @binding(0) var cubemap: texture_cube<f32>;

      @group(1) @binding(1) var texSampler: sampler;

      struct cubeFragmentFn_Input {
        @location(0) texCoord: vec3f,
      }

      @fragment fn cubeFragmentFn(input: cubeFragmentFn_Input) -> @location(0) vec4f {
        return textureSample(cubemap, texSampler, normalize(input.texCoord));
      }

      struct Camera {
        view: mat4x4f,
        projection: mat4x4f,
        position: vec4f,
      }

      @group(0) @binding(0) var<uniform> camera: Camera;

      struct vertexFn_Output {
        @builtin(position) pos: vec4f,
        @location(0) normal: vec4f,
        @location(1) worldPos: vec4f,
      }

      struct vertexFn_Input {
        @location(0) position: vec4f,
        @location(1) normal: vec4f,
      }

      @vertex fn vertexFn(input: vertexFn_Input) -> vertexFn_Output {
        return vertexFn_Output((camera.projection * (camera.view * input.position)), input.normal, input.position);
      }

      struct DirectionalLight {
        direction: vec3f,
        color: vec3f,
        intensity: f32,
      }

      @group(0) @binding(1) var<uniform> light: DirectionalLight;

      struct Material {
        ambient: vec3f,
        diffuse: vec3f,
        specular: vec3f,
        shininess: f32,
        reflectivity: f32,
      }

      @group(0) @binding(2) var<uniform> material: Material;

      @group(1) @binding(0) var cubemap: texture_cube<f32>;

      @group(1) @binding(1) var texSampler: sampler;

      struct fragmentFn_Input {
        @location(0) normal: vec4f,
        @location(1) worldPos: vec4f,
      }

      @fragment fn fragmentFn(input: fragmentFn_Input) -> @location(0) vec4f {
        var normalizedNormal = normalize(input.normal.xyz);
        var normalizedLightDir = normalize(light.direction);
        var ambientLight = (material.ambient * (light.intensity * light.color));
        let diffuseFactor = max(dot(normalizedNormal, normalizedLightDir), 0f);
        var diffuseLight = (diffuseFactor * (material.diffuse * (light.intensity * light.color)));
        var viewDirection = normalize((camera.position.xyz - input.worldPos.xyz));
        var reflectionDirection = reflect(-(normalizedLightDir), normalizedNormal);
        let specularFactor = pow(max(dot(viewDirection, reflectionDirection), 0f), material.shininess);
        var specularLight = (specularFactor * (material.specular * (light.intensity * light.color)));
        var reflectionVector = reflect(-(viewDirection), normalizedNormal);
        var environmentColor = textureSample(cubemap, texSampler, reflectionVector);
        var directLighting = (ambientLight + (diffuseLight + specularLight));
        var finalColor = mix(directLighting, environmentColor.xyz, material.reflectivity);
        return vec4f(finalColor, 1f);
      }"
    `);
  });
});
