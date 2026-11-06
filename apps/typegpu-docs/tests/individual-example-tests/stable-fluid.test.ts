/**
 * @vitest-environment jsdom
 */

import { describe, expect } from 'vitest';
import { it } from 'typegpu-testing-utility';
import { runExampleTest, setupCommonMocks } from './utils/baseTest.ts';
import { mockCreateImageBitmap, mockImageLoading } from './utils/commonMocks.ts';

describe('stable-fluid example', () => {
  setupCommonMocks();

  it('should produce valid code', async ({ device }) => {
    const shaderCodes = await runExampleTest(
      {
        category: 'simulation',
        name: 'stable-fluid',
        setupMocks: () => {
          mockImageLoading();
          mockCreateImageBitmap();
        },
        expectedCalls: 10,
      },
      device,
    );

    expect(shaderCodes).toMatchInlineSnapshot(`
      "
      struct VertexOutput {
        @builtin(position) pos: vec4f,
        @location(0) uv: vec2f,
      }

      @vertex
      fn vs_main(@builtin(vertex_index) i: u32) -> VertexOutput {
        const pos = array(vec2f(-1, -1), vec2f(3, -1), vec2f(-1, 3));
        const uv = array(vec2f(0, 1), vec2f(2, 1), vec2f(0, -1));
        return VertexOutput(vec4f(pos[i], 0, 1), uv[i]);
      }


      @group(0) @binding(0) var src: texture_2d<f32>;
      @group(0) @binding(1) var samp: sampler;

      @fragment
      fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
        return textureSample(src, samp, uv);
      }

      fn cellUv(cell: vec2u) -> vec2f {
        return ((vec2f(cell) + 0.5f) / 512f);
      }

      struct Params {
        dt: f32,
        diffusion: f32,
        inkDecay: f32,
        brushFrom: vec2f,
        brushTo: vec2f,
        brushDown: u32,
      }

      @group(0) @binding(0) var<uniform> params: Params;

      fn clampCell(cell: vec2i) -> vec2i {
        return clamp(cell, vec2i(), vec2i(511));
      }

      @group(1) @binding(0) var velocity: texture_2d<f32>;

      fn loadVelocity(cell: vec2i) -> vec2f {
        return textureLoad(velocity, clampCell(cell), 0).xy;
      }

      @group(0) @binding(1) var sampler_1: sampler;

      fn brushWeight(uv: vec2f) -> f32 {
        let offset = ((uv - params.brushTo) / 0.0625f);
        let distanceSquared = dot(offset, offset);
        let inside = ((params.brushDown == 1u) && (distanceSquared < 1f));
        return select(0f, exp(-(distanceSquared)), inside);
      }

      @group(1) @binding(1) var velocityOut: texture_storage_2d<rgba16float, write>;

      @compute @workgroup_size(16, 16) fn advectVelocity(@builtin(global_invocation_id) gid: vec3u) {
        if (((gid.x >= 512u) || (gid.y >= 512u))) {
          return;
        }
        let uv = cellUv(gid.xy);
        let origin = (uv - ((params.dt * loadVelocity(vec2i(gid.xy))) / 512f));
        let advected = textureSampleLevel(velocity, sampler_1, origin, 0).xy;
        let stroke = ((params.brushTo - params.brushFrom) * 512f);
        let flow = (advected + ((params.dt * brushWeight(uv)) * stroke));
        let interior = (all((gid.xy > vec2u())) && all((gid.xy < vec2u(511))));
        textureStore(velocityOut, gid.xy, vec4f(select(vec2f(), flow, interior), 0f, 1f));
      }

      fn clampCell(cell: vec2i) -> vec2i {
        return clamp(cell, vec2i(), vec2i(511));
      }

      @group(1) @binding(0) var velocity: texture_2d<f32>;

      fn loadVelocity(cell: vec2i) -> vec2f {
        return textureLoad(velocity, clampCell(cell), 0).xy;
      }

      struct Params {
        dt: f32,
        diffusion: f32,
        inkDecay: f32,
        brushFrom: vec2f,
        brushTo: vec2f,
        brushDown: u32,
      }

      @group(0) @binding(0) var<uniform> params: Params;

      @group(1) @binding(1) var velocityOut: texture_storage_2d<rgba16float, write>;

      @compute @workgroup_size(16, 16) fn diffuse(@builtin(global_invocation_id) gid: vec3u) {
        if (((gid.x >= 512u) || (gid.y >= 512u))) {
          return;
        }
        let cell = vec2i(gid.xy);
        let center = loadVelocity(cell);
        let neighbors = (((loadVelocity((cell + vec2i(-1, 0))) + loadVelocity((cell + vec2i(1, 0)))) + loadVelocity((cell + vec2i(0, -1)))) + loadVelocity((cell + vec2i(0, 1))));
        let diffused = (center + (params.diffusion * (neighbors - (4f * center))));
        textureStore(velocityOut, gid.xy, vec4f(diffused, 0f, 1f));
      }

      fn clampCell(cell: vec2i) -> vec2i {
        return clamp(cell, vec2i(), vec2i(511));
      }

      @group(1) @binding(0) var velocity: texture_2d<f32>;

      fn loadVelocity(cell: vec2i) -> vec2f {
        return textureLoad(velocity, clampCell(cell), 0).xy;
      }

      @group(0) @binding(0) var divergence: texture_storage_2d<r32float, read_write>;

      @compute @workgroup_size(16, 16) fn computeDivergence(@builtin(global_invocation_id) gid: vec3u) {
        if (((gid.x >= 512u) || (gid.y >= 512u))) {
          return;
        }
        let cell = vec2i(gid.xy);
        let horizontal = (loadVelocity((cell + vec2i(1, 0))).x - loadVelocity((cell + vec2i(-1, 0))).x);
        let vertical = (loadVelocity((cell + vec2i(0, 1))).y - loadVelocity((cell + vec2i(0, -1))).y);
        textureStore(divergence, cell, vec4f((0.5f * (horizontal + vertical))));
      }

      fn clampCell(cell: vec2i) -> vec2i {
        return clamp(cell, vec2i(), vec2i(511));
      }

      @group(0) @binding(0) var pressure: texture_storage_2d<r32float, read_write>;

      fn loadPressure(cell: vec2i) -> f32 {
        return textureLoad(pressure, clampCell(cell)).x;
      }

      @group(0) @binding(1) var divergence: texture_storage_2d<r32float, read_write>;

      @compute @workgroup_size(16, 16) fn relaxPressure(@builtin(global_invocation_id) gid: vec3u) {
        if ((((gid.x * 2u) >= 512u) || (gid.y >= 512u))) {
          return;
        }
        let cell = vec2i(vec2u(((gid.x * 2u) + ((gid.y + 0u) & 1u)), gid.y));
        let neighbors = (((loadPressure((cell + vec2i(-1, 0))) + loadPressure((cell + vec2i(1, 0)))) + loadPressure((cell + vec2i(0, -1)))) + loadPressure((cell + vec2i(0, 1))));
        let divergenceAtCell = textureLoad(divergence, cell).x;
        textureStore(pressure, cell, vec4f(((neighbors - divergenceAtCell) / 4f)));
      }

      fn clampCell(cell: vec2i) -> vec2i {
        return clamp(cell, vec2i(), vec2i(511));
      }

      @group(0) @binding(0) var pressure: texture_storage_2d<r32float, read_write>;

      fn loadPressure(cell: vec2i) -> f32 {
        return textureLoad(pressure, clampCell(cell)).x;
      }

      @group(0) @binding(1) var divergence: texture_storage_2d<r32float, read_write>;

      @compute @workgroup_size(16, 16) fn relaxPressure(@builtin(global_invocation_id) gid: vec3u) {
        if ((((gid.x * 2u) >= 512u) || (gid.y >= 512u))) {
          return;
        }
        let cell = vec2i(vec2u(((gid.x * 2u) + ((gid.y + 1u) & 1u)), gid.y));
        let neighbors = (((loadPressure((cell + vec2i(-1, 0))) + loadPressure((cell + vec2i(1, 0)))) + loadPressure((cell + vec2i(0, -1)))) + loadPressure((cell + vec2i(0, 1))));
        let divergenceAtCell = textureLoad(divergence, cell).x;
        textureStore(pressure, cell, vec4f(((neighbors - divergenceAtCell) / 4f)));
      }

      fn clampCell(cell: vec2i) -> vec2i {
        return clamp(cell, vec2i(), vec2i(511));
      }

      @group(0) @binding(0) var pressure: texture_storage_2d<r32float, read_write>;

      fn loadPressure(cell: vec2i) -> f32 {
        return textureLoad(pressure, clampCell(cell)).x;
      }

      @group(1) @binding(0) var velocity: texture_2d<f32>;

      fn loadVelocity(cell: vec2i) -> vec2f {
        return textureLoad(velocity, clampCell(cell), 0).xy;
      }

      @group(1) @binding(1) var velocityOut: texture_storage_2d<rgba16float, write>;

      @compute @workgroup_size(16, 16) fn project(@builtin(global_invocation_id) gid: vec3u) {
        if (((gid.x >= 512u) || (gid.y >= 512u))) {
          return;
        }
        let cell = vec2i(gid.xy);
        let gradient = vec2f((loadPressure((cell + vec2i(1, 0))) - loadPressure((cell + vec2i(-1, 0)))), (loadPressure((cell + vec2i(0, 1))) - loadPressure((cell + vec2i(0, -1)))));
        let projected = (loadVelocity(cell) - (0.5f * gradient));
        textureStore(velocityOut, gid.xy, vec4f(projected, 0f, 1f));
      }

      fn cellUv(cell: vec2u) -> vec2f {
        return ((vec2f(cell) + 0.5f) / 512f);
      }

      struct Params {
        dt: f32,
        diffusion: f32,
        inkDecay: f32,
        brushFrom: vec2f,
        brushTo: vec2f,
        brushDown: u32,
      }

      @group(0) @binding(0) var<uniform> params: Params;

      fn clampCell(cell: vec2i) -> vec2i {
        return clamp(cell, vec2i(), vec2i(511));
      }

      @group(1) @binding(0) var velocity: texture_2d<f32>;

      fn loadVelocity(cell: vec2i) -> vec2f {
        return textureLoad(velocity, clampCell(cell), 0).xy;
      }

      @group(2) @binding(0) var ink: texture_2d<f32>;

      @group(0) @binding(1) var sampler_1: sampler;

      fn brushWeight(uv: vec2f) -> f32 {
        let offset = ((uv - params.brushTo) / 0.0625f);
        let distanceSquared = dot(offset, offset);
        let inside = ((params.brushDown == 1u) && (distanceSquared < 1f));
        return select(0f, exp(-(distanceSquared)), inside);
      }

      @group(2) @binding(1) var inkOut: texture_storage_2d<rgba16float, write>;

      @compute @workgroup_size(16, 16) fn advectInk(@builtin(global_invocation_id) gid: vec3u) {
        if (((gid.x >= 512u) || (gid.y >= 512u))) {
          return;
        }
        let uv = cellUv(gid.xy);
        let origin = (uv - ((params.dt * loadVelocity(vec2i(gid.xy))) / 512f));
        let ink_1 = (textureSampleLevel(ink, sampler_1, origin, 0).x * params.inkDecay);
        let added = mix(ink_1, 1f, (0.05f * brushWeight(uv)));
        textureStore(inkOut, gid.xy, vec4f(added, 0f, 0f, 1f));
      }

      struct fullScreenTriangle_Output {
        @builtin(position) pos: vec4f,
        @location(0) uv: vec2f,
      }

      @vertex fn fullScreenTriangle(@builtin(vertex_index) vertexIndex: u32) -> fullScreenTriangle_Output {
        const pos = array<vec2f, 3>(vec2f(-1, -1), vec2f(3, -1), vec2f(-1, 3));
        const uv = array<vec2f, 3>(vec2f(0, 1), vec2f(2, 1), vec2f(0, -1));

        return fullScreenTriangle_Output(vec4f(pos[vertexIndex], 0, 1), uv[vertexIndex]);
      }

      @group(0) @binding(0) var<uniform> displayMode: u32;

      @group(1) @binding(0) var velocity: texture_2d<f32>;

      @group(0) @binding(1) var sampler_1: sampler;

      @group(2) @binding(0) var ink: texture_2d<f32>;

      fn sampleInk(uv: vec2f) -> f32 {
        return textureSampleLevel(ink, sampler_1, uv, 0).x;
      }

      @group(0) @binding(2) var background: texture_2d<f32>;

      fn sampleBackground(uv: vec2f) -> vec4f {
        return textureSample(background, sampler_1, uv);
      }

      struct shade_Input {
        @location(0) uv: vec2f,
      }

      @fragment fn shade(_arg_0: shade_Input) -> @location(0) vec4f {
        if ((displayMode == 1u)) {
          let flow = textureSampleLevel(velocity, sampler_1, _arg_0.uv, 0).xy;
          return vec4f((((flow * vec2f(1, -1)) + 1f) * 0.5f), (length(flow) * 0.4f), 1f);
        }
        if ((displayMode == 2u)) {
          let density = sampleInk(_arg_0.uv);
          return vec4f(density, (density * 0.8f), (density * 0.5f), 1f);
        }
        let texel = vec2f(0.001953125, 0);
        let slope = vec2f((sampleInk((_arg_0.uv + texel)) - sampleInk((_arg_0.uv - texel))), (sampleInk((_arg_0.uv + texel.yx)) - sampleInk((_arg_0.uv - texel.yx))));
        let normal = normalize(vec3f((slope * -8f), 1f));
        let color = vec3f(sampleBackground((_arg_0.uv - (normal.xy * 0.09f))).r, sampleBackground((_arg_0.uv - (normal.xy * 0.1f))).g, sampleBackground((_arg_0.uv - (normal.xy * 0.11f))).b);
        let halfway = vec3f(-0.17047123610973358, -0.2557068467140198, 0.9516057968139648);
        let specular = (pow(max(dot(normal, halfway), 0f), 80f) * 0.6f);
        return vec4f((color + specular), 1f);
      }"
    `);
  });
});
