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
        mockImageLoading();
        mockResizeObserver();
      },
      expectedCalls: 3,
    }, device);

    expect(shaderCodes).toMatchInlineSnapshot(`
      "struct computeFn_Input_1 {
        @builtin(global_invocation_id) gid: vec3u,
      }

      struct ComputeVertex_3 {
        position: vec2u,
        normal: vec2u,
      }

      @group(0) @binding(0) var<storage, read> prevVertices_2: array<ComputeVertex_3>;

      fn unpackVec2u_4(packed: vec2u) -> vec4f {
        var xy = unpack2x16float(packed.x);
        var zw = unpack2x16float(packed.y);
        return vec4f(xy, zw);
      }

      fn calculateMidpoint_5(v1: vec4f, v2: vec4f) -> vec4f {
        return vec4f((0.5 * (v1.xyz + v2.xyz)), 1);
      }

      @group(0) @binding(2) var<uniform> smoothFlag_6: u32;

      fn getAverageNormal_7(v1: vec4f, v2: vec4f, v3: vec4f) -> vec4f {
        var edge1 = (v2.xyz - v1.xyz);
        var edge2 = (v3.xyz - v1.xyz);
        return normalize(vec4f(cross(edge1, edge2), 0));
      }

      @group(0) @binding(1) var<storage, read_write> nextVertices_8: array<ComputeVertex_3>;

      fn packVec2u_9(toPack: vec4f) -> vec2u {
        var xy = pack2x16float(toPack.xy);
        var zw = pack2x16float(toPack.zw);
        return vec2u(xy, zw);
      }

      @compute @workgroup_size(256, 1, 1) fn computeFn_0(input: computeFn_Input_1) {
        var triangleCount = u32((f32(arrayLength(&prevVertices_2)) / 3f));
        var triangleIndex = (input.gid.x + (input.gid.y * 65535));
        if ((triangleIndex >= triangleCount)) {
          return;
        }
        var baseIndexPrev = (triangleIndex * 3);
        var v1 = unpackVec2u_4(prevVertices_2[baseIndexPrev].position);
        var v2 = unpackVec2u_4(prevVertices_2[(baseIndexPrev + 1)].position);
        var v3 = unpackVec2u_4(prevVertices_2[(baseIndexPrev + 2)].position);
        var v12 = vec4f(normalize(calculateMidpoint_5(v1, v2).xyz), 1);
        var v23 = vec4f(normalize(calculateMidpoint_5(v2, v3).xyz), 1);
        var v31 = vec4f(normalize(calculateMidpoint_5(v3, v1).xyz), 1);
        var newVertices = array<vec4f, 12>(v1, v12, v31, v2, v23, v12, v3, v31, v23, v12, v23, v31);
        var baseIndexNext = (triangleIndex * 12);
        for (var i = 0u; (i < 12); i++) {
          var reprojectedVertex = newVertices[i];
          var triBase = (i - (i % 3));
          var normal = reprojectedVertex;
          if ((smoothFlag_6 == 0)) {
            normal = getAverageNormal_7(newVertices[triBase], newVertices[(triBase + 1)], newVertices[(triBase + 2)]);
          }
          var outIndex = (baseIndexNext + i);
          var nextVertex = nextVertices_8[outIndex];
          nextVertex.position = packVec2u_9(reprojectedVertex);
          nextVertex.normal = packVec2u_9(normal);
          nextVertices_8[outIndex] = nextVertex;
        }
      }

      struct cubeVertexFn_Input_1 {
        @location(0) position: vec3f,
        @location(1) uv: vec2f,
      }

      struct cubeVertexFn_Output_2 {
        @builtin(position) pos: vec4f,
        @location(0) texCoord: vec3f,
      }

      struct Camera_4 {
        view: mat4x4f,
        projection: mat4x4f,
        position: vec4f,
      }

      @group(0) @binding(0) var<uniform> camera_3: Camera_4;

      @vertex fn cubeVertexFn_0(input: cubeVertexFn_Input_1) -> cubeVertexFn_Output_2 {
        var viewPos = (camera_3.view * vec4f(input.position.xyz, 0)).xyz;
        return cubeVertexFn_Output_2((camera_3.projection * vec4f(viewPos, 1)), input.position.xyz);
      }

      struct cubeFragmentFn_Input_6 {
        @location(0) texCoord: vec3f,
      }

      @group(1) @binding(0) var cubemap_7: texture_cube<f32>;

      @group(1) @binding(1) var texSampler_8: sampler;

      @fragment fn cubeFragmentFn_5(input: cubeFragmentFn_Input_6) -> @location(0) vec4f {
        return textureSample(cubemap_7, texSampler_8, normalize(input.texCoord));
      }

      struct vertexFn_Input_1 {
        @location(0) position: vec4f,
        @location(1) normal: vec4f,
      }

      struct vertexFn_Output_2 {
        @builtin(position) pos: vec4f,
        @location(0) normal: vec4f,
        @location(1) worldPos: vec4f,
      }

      struct Camera_4 {
        view: mat4x4f,
        projection: mat4x4f,
        position: vec4f,
      }

      @group(0) @binding(0) var<uniform> camera_3: Camera_4;

      @vertex fn vertexFn_0(input: vertexFn_Input_1) -> vertexFn_Output_2 {
        return vertexFn_Output_2((camera_3.projection * (camera_3.view * input.position)), input.normal, input.position);
      }

      struct fragmentFn_Input_6 {
        @location(0) normal: vec4f,
        @location(1) worldPos: vec4f,
      }

      struct DirectionalLight_8 {
        direction: vec3f,
        color: vec3f,
        intensity: f32,
      }

      @group(0) @binding(1) var<uniform> light_7: DirectionalLight_8;

      struct Material_10 {
        ambient: vec3f,
        diffuse: vec3f,
        specular: vec3f,
        shininess: f32,
        reflectivity: f32,
      }

      @group(0) @binding(2) var<uniform> material_9: Material_10;

      @group(1) @binding(0) var cubemap_11: texture_cube<f32>;

      @group(1) @binding(1) var texSampler_12: sampler;

      @fragment fn fragmentFn_5(input: fragmentFn_Input_6) -> @location(0) vec4f {
        var normalizedNormal = normalize(input.normal.xyz);
        var normalizedLightDir = normalize(light_7.direction);
        var ambientLight = (material_9.ambient * (light_7.intensity * light_7.color));
        var diffuseFactor = max(dot(normalizedNormal, normalizedLightDir), 0);
        var diffuseLight = (diffuseFactor * (material_9.diffuse * (light_7.intensity * light_7.color)));
        var viewDirection = normalize((camera_3.position.xyz - input.worldPos.xyz));
        var reflectionDirection = reflect(-(normalizedLightDir), normalizedNormal);
        var specularFactor = pow(max(dot(viewDirection, reflectionDirection), 0), material_9.shininess);
        var specularLight = (specularFactor * (material_9.specular * (light_7.intensity * light_7.color)));
        var reflectionVector = reflect(-(viewDirection), normalizedNormal);
        var environmentColor = textureSample(cubemap_11, texSampler_12, reflectionVector);
        var directLighting = (ambientLight + (diffuseLight + specularLight));
        var finalColor = mix(directLighting, environmentColor.xyz, material_9.reflectivity);
        return vec4f(finalColor, 1);
      }"
    `);
  });
});
