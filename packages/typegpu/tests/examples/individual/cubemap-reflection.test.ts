/**
 * @vitest-environment jsdom
 */

import { describe, expect } from 'vitest';
import { it } from '../../utils/extendedIt.ts';
import { runExampleTest, setupCommonMocks } from '../utils/baseTest.ts';
import { mockImageLoading, mockResizeObserver } from '../utils/commonMocks.ts';

describe('cubemap reflection example', () => {
  setupCommonMocks();

  it('should produce valid code', async ({ device }) => {
    const shaderCodes = await runExampleTest({
      category: 'rendering',
      name: 'cubemap-reflection',
      setupMocks: () => {
        mockImageLoading({ width: 2048, height: 2048 });
        mockResizeObserver();
      },
      expectedCalls: 3,
    }, device);

    expect(shaderCodes).toMatchInlineSnapshot(`
      "struct ComputeVertex_2 {
        position: vec2u,
        normal: vec2u,
      }

      @group(0) @binding(0) var<storage, read> prevVertices_1: array<ComputeVertex_2>;

      fn unpackVec2u_3(packed: vec2u) -> vec4f {
        var xy = unpack2x16float(packed.x);
        var zw = unpack2x16float(packed.y);
        return vec4f(xy, zw);
      }

      fn calculateMidpoint_4(v1: vec4f, v2: vec4f) -> vec4f {
        return vec4f((0.5 * (v1.xyz + v2.xyz)), 1);
      }

      @group(0) @binding(2) var<uniform> smoothFlag_5: u32;

      fn getAverageNormal_6(v1: vec4f, v2: vec4f, v3: vec4f) -> vec4f {
        var edge1 = (v2.xyz - v1.xyz);
        var edge2 = (v3.xyz - v1.xyz);
        return normalize(vec4f(cross(edge1, edge2), 0));
      }

      @group(0) @binding(1) var<storage, read_write> nextVertices_7: array<ComputeVertex_2>;

      fn packVec2u_8(toPack: vec4f) -> vec2u {
        var xy = pack2x16float(toPack.xy);
        var zw = pack2x16float(toPack.zw);
        return vec2u(xy, zw);
      }

      struct computeFn_Input_9 {
        @builtin(global_invocation_id) gid: vec3u,
      }

      @compute @workgroup_size(256, 1, 1) fn computeFn_0(input: computeFn_Input_9) {
        var triangleCount = u32((f32(arrayLength(&prevVertices_1)) / 3f));
        var triangleIndex = (input.gid.x + (input.gid.y * 65535));
        if ((triangleIndex >= triangleCount)) {
          return;
        }
        var baseIndexPrev = (triangleIndex * 3);
        var v1 = unpackVec2u_3(prevVertices_1[baseIndexPrev].position);
        var v2 = unpackVec2u_3(prevVertices_1[(baseIndexPrev + 1)].position);
        var v3 = unpackVec2u_3(prevVertices_1[(baseIndexPrev + 2)].position);
        var v12 = vec4f(normalize(calculateMidpoint_4(v1, v2).xyz), 1);
        var v23 = vec4f(normalize(calculateMidpoint_4(v2, v3).xyz), 1);
        var v31 = vec4f(normalize(calculateMidpoint_4(v3, v1).xyz), 1);
        var newVertices = array<vec4f, 12>(v1, v12, v31, v2, v23, v12, v3, v31, v23, v12, v23, v31);
        var baseIndexNext = (triangleIndex * 12);
        for (var i = 0u; (i < 12); i++) {
          var reprojectedVertex = newVertices[i];
          var triBase = (i - (i % 3));
          var normal = reprojectedVertex;
          if ((smoothFlag_5 == 0)) {
            normal = getAverageNormal_6(newVertices[triBase], newVertices[(triBase + 1)], newVertices[(triBase + 2)]);
          }
          var outIndex = (baseIndexNext + i);
          var nextVertex = nextVertices_7[outIndex];
          nextVertex.position = packVec2u_8(reprojectedVertex);
          nextVertex.normal = packVec2u_8(normal);
          nextVertices_7[outIndex] = nextVertex;
        }
      }

      struct Camera_2 {
        view: mat4x4f,
        projection: mat4x4f,
        position: vec4f,
      }

      @group(0) @binding(0) var<uniform> camera_1: Camera_2;

      struct cubeVertexFn_Output_3 {
        @builtin(position) pos: vec4f,
        @location(0) texCoord: vec3f,
      }

      struct cubeVertexFn_Input_4 {
        @location(0) position: vec3f,
        @location(1) uv: vec2f,
      }

      @vertex fn cubeVertexFn_0(input: cubeVertexFn_Input_4) -> cubeVertexFn_Output_3 {
        var viewPos = (camera_1.view * vec4f(input.position.xyz, 0)).xyz;
        return cubeVertexFn_Output_3((camera_1.projection * vec4f(viewPos, 1)), input.position.xyz);
      }

      @group(1) @binding(0) var cubemap_6: texture_cube<f32>;

      @group(1) @binding(1) var texSampler_7: sampler;

      struct cubeFragmentFn_Input_8 {
        @location(0) texCoord: vec3f,
      }

      @fragment fn cubeFragmentFn_5(input: cubeFragmentFn_Input_8) -> @location(0) vec4f {
        return textureSample(cubemap_6, texSampler_7, normalize(input.texCoord));
      }

      struct Camera_2 {
        view: mat4x4f,
        projection: mat4x4f,
        position: vec4f,
      }

      @group(0) @binding(0) var<uniform> camera_1: Camera_2;

      struct vertexFn_Output_3 {
        @builtin(position) pos: vec4f,
        @location(0) normal: vec4f,
        @location(1) worldPos: vec4f,
      }

      struct vertexFn_Input_4 {
        @location(0) position: vec4f,
        @location(1) normal: vec4f,
      }

      @vertex fn vertexFn_0(input: vertexFn_Input_4) -> vertexFn_Output_3 {
        return vertexFn_Output_3((camera_1.projection * (camera_1.view * input.position)), input.normal, input.position);
      }

      struct DirectionalLight_7 {
        direction: vec3f,
        color: vec3f,
        intensity: f32,
      }

      @group(0) @binding(1) var<uniform> light_6: DirectionalLight_7;

      struct Material_9 {
        ambient: vec3f,
        diffuse: vec3f,
        specular: vec3f,
        shininess: f32,
        reflectivity: f32,
      }

      @group(0) @binding(2) var<uniform> material_8: Material_9;

      @group(1) @binding(0) var cubemap_10: texture_cube<f32>;

      @group(1) @binding(1) var texSampler_11: sampler;

      struct fragmentFn_Input_12 {
        @location(0) normal: vec4f,
        @location(1) worldPos: vec4f,
      }

      @fragment fn fragmentFn_5(input: fragmentFn_Input_12) -> @location(0) vec4f {
        var normalizedNormal = normalize(input.normal.xyz);
        var normalizedLightDir = normalize(light_6.direction);
        var ambientLight = (material_8.ambient * (light_6.intensity * light_6.color));
        var diffuseFactor = max(dot(normalizedNormal, normalizedLightDir), 0);
        var diffuseLight = (diffuseFactor * (material_8.diffuse * (light_6.intensity * light_6.color)));
        var viewDirection = normalize((camera_1.position.xyz - input.worldPos.xyz));
        var reflectionDirection = reflect(-(normalizedLightDir), normalizedNormal);
        var specularFactor = pow(max(dot(viewDirection, reflectionDirection), 0), material_8.shininess);
        var specularLight = (specularFactor * (material_8.specular * (light_6.intensity * light_6.color)));
        var reflectionVector = reflect(-(viewDirection), normalizedNormal);
        var environmentColor = textureSample(cubemap_10, texSampler_11, reflectionVector);
        var directLighting = (ambientLight + (diffuseLight + specularLight));
        var finalColor = mix(directLighting, environmentColor.xyz, material_8.reflectivity);
        return vec4f(finalColor, 1);
      }"
    `);
  });
});
