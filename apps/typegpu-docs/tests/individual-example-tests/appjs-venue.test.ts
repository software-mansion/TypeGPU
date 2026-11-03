/**
 * @vitest-environment jsdom
 */

import { describe, expect } from 'vitest';
import { it } from 'typegpu-testing-utility';
import { runExampleTest, setupCommonMocks } from './utils/baseTest.ts';
import {
  mockBinaryLoading,
  mockCreateImageBitmap,
  mockImageLoading,
  mockResizeObserver,
} from './utils/commonMocks.ts';

describe('app.js venue example', () => {
  setupCommonMocks();

  it('should produce valid code', async ({ device }) => {
    const shaderCodes = await runExampleTest(
      {
        category: 'advanced',
        name: 'appjs-venue',
        setupMocks: () => {
          mockResizeObserver();
          mockBinaryLoading();
          mockImageLoading();
          mockCreateImageBitmap();
        },
        expectedCalls: 9,
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

      struct Camera {
        view: mat4x4f,
        viewProjection: mat4x4f,
      }

      @group(0) @binding(0) var<uniform> cameraUniform: Camera;

      fn projectToClip(position: vec3f) -> vec4f {
        return (cameraUniform.viewProjection * vec4f(position, 1f));
      }

      fn viewDepth(position: vec3f) -> f32 {
        return -((cameraUniform.view * vec4f(position, 1f)).z);
      }

      struct VertexOut {
        @builtin(position) position: vec4f,
        @location(0) uv: vec2f,
        @location(1) worldPosition: vec3f,
        @location(2) worldNormal: vec3f,
        @location(3) depth: f32,
      }

      struct VertexIn {
        @location(0) position: vec3f,
        @location(1) uv: vec2f,
        @location(2) normal: vec3f,
      }

      @vertex fn vertex(_arg_0: VertexIn) -> VertexOut {
        return VertexOut(projectToClip(_arg_0.position), _arg_0.uv, _arg_0.position, _arg_0.normal, viewDepth(_arg_0.position));
      }

      const palette: array<vec3f, 3> = array<vec3f, 3>(vec3f(1), vec3f(0.9333333373069763, 0.9450980424880981, 1), vec3f(0.800000011920929, 0.8392156958580017, 1));

      fn paletteColor(uv: vec2f) -> vec3f {
        let index = clamp(i32(-(floor(uv.y))), 0i, 2i);
        return palette[index];
      }

      struct FragmentOut {
        @location(0) albedo: vec4f,
        @location(1) normal: vec4f,
        @location(2) depth: vec4f,
      }

      struct FragmentIn {
        @location(1) worldPosition: vec3f,
        @location(2) worldNormal: vec3f,
        @builtin(front_facing) frontFacing: bool,
        @location(0) uv: vec2f,
        @location(3) depth: f32,
      }

      @fragment fn fragment(_arg_0: FragmentIn) -> FragmentOut {
        let opacity = saturate((1f + saturate((0.3f - (_arg_0.worldPosition.y * 1.5f)))));
        let normal = select(-(_arg_0.worldNormal), _arg_0.worldNormal, _arg_0.frontFacing);
        return FragmentOut((vec4f(paletteColor(_arg_0.uv), 1f) * opacity), (vec4f(normal, 1f) * opacity), (vec4f(_arg_0.depth, 0f, 0f, 1f) * opacity));
      }

      struct Camera {
        view: mat4x4f,
        viewProjection: mat4x4f,
      }

      @group(0) @binding(0) var<uniform> cameraUniform: Camera;

      fn projectToClip(position: vec3f) -> vec4f {
        return (cameraUniform.viewProjection * vec4f(position, 1f));
      }

      struct VertexOut {
        @builtin(position) position: vec4f,
        @location(0) uv: vec2f,
      }

      struct VertexIn {
        @location(0) position: vec3f,
        @location(1) uv: vec2f,
      }

      @vertex fn vertex(_arg_0: VertexIn) -> VertexOut {
        return VertexOut(projectToClip(_arg_0.position), _arg_0.uv);
      }

      fn sdRoundedBox2d(point: vec2f, size: vec2f, cornerRadius: f32) -> f32 {
        let dd = ((abs(point) - size) + cornerRadius);
        return ((length(max(dd, vec2f())) + min(max(dd.x, dd.y), 0f)) - cornerRadius);
      }

      const palette: array<vec3f, 3> = array<vec3f, 3>(vec3f(1), vec3f(0.9333333373069763, 0.9450980424880981, 1), vec3f(0.800000011920929, 0.8392156958580017, 1));

      fn paletteColor(uv: vec2f) -> vec3f {
        let index = clamp(i32(-(floor(uv.y))), 0i, 2i);
        return palette[index];
      }

      struct FragmentOut {
        @location(0) albedo: vec4f,
        @location(1) normal: vec4f,
        @location(2) depth: vec4f,
      }

      struct FragmentIn {
        @location(0) uv: vec2f,
      }

      @fragment fn fragment(_arg_0: FragmentIn) -> FragmentOut {
        let dist = sdRoundedBox2d((fract(_arg_0.uv) - 1f), vec2f(0.75), 0.5f);
        let opacity = smoothstep(fwidth(_arg_0.uv.x), 0f, dist);
        return FragmentOut((vec4f(paletteColor(_arg_0.uv), 1f) * opacity), vec4f(), vec4f());
      }

      struct Camera {
        view: mat4x4f,
        viewProjection: mat4x4f,
      }

      @group(0) @binding(0) var<uniform> cameraUniform: Camera;

      fn projectToClip(position: vec3f) -> vec4f {
        return (cameraUniform.viewProjection * vec4f(position, 1f));
      }

      struct VertexOut {
        @builtin(position) position: vec4f,
        @location(0) worldPosition: vec3f,
        @location(1) uv: vec2f,
      }

      struct VertexIn {
        @location(0) position: vec3f,
        @location(1) uv: vec2f,
      }

      @vertex fn vertex(_arg_0: VertexIn) -> VertexOut {
        return VertexOut(projectToClip(_arg_0.position), _arg_0.position, _arg_0.uv);
      }

      @group(0) @binding(1) var<uniform> timeUniform: f32;

      struct FragmentOut {
        @location(0) albedo: vec4f,
        @location(1) normal: vec4f,
        @location(2) depth: vec4f,
      }

      struct FragmentIn {
        @location(0) worldPosition: vec3f,
        @location(1) uv: vec2f,
      }

      @fragment fn fragment(_arg_0: FragmentIn) -> FragmentOut {
        let pulse = sin(((timeUniform * 6f) + ((_arg_0.worldPosition.x + _arg_0.worldPosition.z) * 20f)));
        let opacity = saturate(((pow(_arg_0.uv.y, 5f) * smoothstep(2.2f, 2f, _arg_0.worldPosition.z)) * (0.8f + (pulse * 0.2f))));
        let normal = mix(vec3f(0, 1, 0), vec3f(1, 0, 0), opacity);
        return FragmentOut(vec4f(), (vec4f(normal, 1f) * opacity), vec4f());
      }

      struct TileInstance {
        offset: vec3f,
        angle: f32,
        size: vec2f,
        tilt: f32,
      }

      const tileInstances: array<TileInstance, 9> = array<TileInstance, 9>(TileInstance(vec3f(-0.15000000596046448, 0.25, 1.649999976158142), -1f, vec2f(0.07999999821186066), -0.7853981633974483f), TileInstance(vec3f(-0.28999999165534973, 0.009999999776482582, -0.9900000095367432), 0f, vec2f(0.07999999821186066), 0f), TileInstance(vec3f(-0.2800000011920929, 0.05000000074505806, -2), 0f, vec2f(0.23999999463558197), 0f), TileInstance(vec3f(-0.6549999713897705, 0.18000000715255737, -0.125), 0f, vec2f(0.07999999821186066), 0f), TileInstance(vec3f(-0.20999999344348907, 0.18000000715255737, -0.125), 0f, vec2f(0.07999999821186066), 0f), TileInstance(vec3f(0.054999999701976776, 0.009999999776482582, 0.14499999582767487), 0f, vec2f(0.07999999821186066), 0f), TileInstance(vec3f(0.5, 0, 0.3499999940395355), 0f, vec2f(0.07999999821186066), 0f), TileInstance(vec3f(0.4099999964237213, 0.009999999776482582, 1.2200000286102295), 0f, vec2f(0.23999999463558197), 0f), TileInstance(vec3f(0.16500000655651093, 0.17100000381469727, -0.27000001072883606), -1.5707963267948966f, vec2f(0.07999999821186066), 0f));

      const quadCorners: array<vec2f, 6> = array<vec2f, 6>(vec2f(-0.5), vec2f(0.5, -0.5), vec2f(-0.5, 0.5), vec2f(0.5, -0.5), vec2f(0.5), vec2f(-0.5, 0.5));

      fn rotateX(v: vec3f, angle: f32) -> vec3f {
        let cos_1 = cos(angle);
        let sin_1 = sin(angle);
        return vec3f(v.x, ((v.z * sin_1) - (v.y * cos_1)), ((v.z * cos_1) + (v.y * sin_1)));
      }

      fn rotateY(v: vec3f, angle: f32) -> vec3f {
        let cos_1 = cos(angle);
        let sin_1 = sin(angle);
        return vec3f(((v.x * cos_1) - (v.z * sin_1)), v.y, ((v.x * sin_1) + (v.z * cos_1)));
      }

      struct Camera {
        view: mat4x4f,
        viewProjection: mat4x4f,
      }

      @group(0) @binding(0) var<uniform> cameraUniform: Camera;

      fn projectToClip(position: vec3f) -> vec4f {
        return (cameraUniform.viewProjection * vec4f(position, 1f));
      }

      struct VertexOut {
        @builtin(position) position: vec4f,
        @location(0) uv: vec2f,
        @location(1) @interpolate(flat) layer: u32,
      }

      struct VertexIn {
        @builtin(instance_index) instanceIndex: u32,
        @builtin(vertex_index) vertexIndex: u32,
      }

      @vertex fn vertex(_arg_0: VertexIn) -> VertexOut {
        let tile = tileInstances[_arg_0.instanceIndex];
        let corner = quadCorners[_arg_0.vertexIndex];
        let scaled = (corner * tile.size);
        let worldPosition = (rotateY(rotateX(vec3f(scaled.x, 0f, scaled.y), tile.tilt), tile.angle) + tile.offset);
        return VertexOut(projectToClip(worldPosition), (corner + 0.5f), _arg_0.instanceIndex);
      }

      @group(0) @binding(1) var tileAtlasView: texture_2d_array<f32>;

      @group(0) @binding(2) var tileSampler: sampler;

      struct FragmentOut {
        @location(0) albedo: vec4f,
        @location(1) normal: vec4f,
        @location(2) depth: vec4f,
      }

      struct FragmentIn {
        @location(0) uv: vec2f,
        @location(1) @interpolate(flat) layer: u32,
      }

      @fragment fn fragment(_arg_0: FragmentIn) -> FragmentOut {
        let color = textureSample(tileAtlasView, tileSampler, _arg_0.uv, _arg_0.layer);
        if ((color.a <= 0f)) {
          discard;;
        }
        return FragmentOut(vec4f((color.rgb * color.a), color.a), vec4f(), vec4f());
      }

      struct Camera {
        view: mat4x4f,
        viewProjection: mat4x4f,
      }

      @group(0) @binding(0) var<uniform> cameraUniform: Camera;

      fn projectToClip(position: vec3f) -> vec4f {
        return (cameraUniform.viewProjection * vec4f(position, 1f));
      }

      fn viewDepth(position: vec3f) -> f32 {
        return -((cameraUniform.view * vec4f(position, 1f)).z);
      }

      struct VertexOut {
        @builtin(position) position: vec4f,
        @location(0) uv: vec2f,
        @location(1) worldPosition: vec3f,
        @location(2) worldNormal: vec3f,
        @location(3) depth: f32,
      }

      struct VertexIn {
        @location(0) position: vec3f,
        @location(1) uv: vec2f,
        @location(2) normal: vec3f,
      }

      @vertex fn vertex(_arg_0: VertexIn) -> VertexOut {
        return VertexOut(projectToClip(_arg_0.position), _arg_0.uv, _arg_0.position, _arg_0.normal, viewDepth(_arg_0.position));
      }

      @group(0) @binding(1) var accessoriesView: texture_2d<f32>;

      @group(0) @binding(2) var linearSampler: sampler;

      fn item(uv: vec2f) -> vec3f {
        return textureSample(accessoriesView, linearSampler, uv).rgb;
      }

      struct FragmentOut {
        @location(0) albedo: vec4f,
        @location(1) normal: vec4f,
        @location(2) depth: vec4f,
      }

      struct FragmentIn {
        @location(1) worldPosition: vec3f,
        @location(2) worldNormal: vec3f,
        @builtin(front_facing) frontFacing: bool,
        @location(0) uv: vec2f,
        @location(3) depth: f32,
      }

      @fragment fn fragment(_arg_0: FragmentIn) -> FragmentOut {
        let opacity = saturate((1f + saturate((0.3f - (_arg_0.worldPosition.y * 1.5f)))));
        let normal = select(-(_arg_0.worldNormal), _arg_0.worldNormal, _arg_0.frontFacing);
        return FragmentOut((vec4f(item(_arg_0.uv), 1f) * opacity), (vec4f(normal, 1f) * opacity), (vec4f(_arg_0.depth, 0f, 0f, 1f) * opacity));
      }

      struct Camera {
        view: mat4x4f,
        viewProjection: mat4x4f,
      }

      @group(0) @binding(0) var<uniform> cameraUniform: Camera;

      fn projectToClip(position: vec3f) -> vec4f {
        return (cameraUniform.viewProjection * vec4f(position, 1f));
      }

      fn viewDepth(position: vec3f) -> f32 {
        return -((cameraUniform.view * vec4f(position, 1f)).z);
      }

      struct VertexOut {
        @builtin(position) position: vec4f,
        @location(0) uv: vec2f,
        @location(1) worldPosition: vec3f,
        @location(2) worldNormal: vec3f,
        @location(3) depth: f32,
      }

      struct VertexIn {
        @location(0) position: vec3f,
        @location(1) uv: vec2f,
        @location(2) normal: vec3f,
      }

      @vertex fn vertex(_arg_0: VertexIn) -> VertexOut {
        return VertexOut(projectToClip(_arg_0.position), _arg_0.uv, _arg_0.position, _arg_0.normal, viewDepth(_arg_0.position));
      }

      @group(0) @binding(1) var<uniform> outsideOpacityUniform: f32;

      const palette: array<vec3f, 3> = array<vec3f, 3>(vec3f(1), vec3f(0.9333333373069763, 0.9450980424880981, 1), vec3f(0.800000011920929, 0.8392156958580017, 1));

      fn paletteColor(uv: vec2f) -> vec3f {
        let index = clamp(i32(-(floor(uv.y))), 0i, 2i);
        return palette[index];
      }

      struct FragmentOut {
        @location(0) albedo: vec4f,
        @location(1) normal: vec4f,
        @location(2) depth: vec4f,
      }

      struct FragmentIn {
        @location(1) worldPosition: vec3f,
        @location(2) worldNormal: vec3f,
        @builtin(front_facing) frontFacing: bool,
        @location(0) uv: vec2f,
        @location(3) depth: f32,
      }

      @fragment fn fragment(_arg_0: FragmentIn) -> FragmentOut {
        let opacity = saturate((outsideOpacityUniform + saturate((0.3f - (_arg_0.worldPosition.y * 1.5f)))));
        let normal = select(-(_arg_0.worldNormal), _arg_0.worldNormal, _arg_0.frontFacing);
        return FragmentOut((vec4f(paletteColor(_arg_0.uv), 1f) * opacity), (vec4f(normal, 1f) * opacity), (vec4f(_arg_0.depth, 0f, 0f, 1f) * opacity));
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

      @group(1) @binding(0) var albedoMap: texture_2d<f32>;

      @group(1) @binding(1) var normalMap: texture_2d<f32>;

      @group(0) @binding(0) var linearSampler: sampler;

      @group(1) @binding(2) var depthMap: texture_2d<f32>;

      @group(0) @binding(1) var<uniform> fadeInUniform: f32;

      struct FragmentIn {
        @builtin(position) position: vec4f,
        @location(0) uv: vec2f,
      }

      @fragment fn fragment(_arg_0: FragmentIn) -> @location(0) vec4f {
        let albedo = textureLoad(albedoMap, vec2i(_arg_0.position.xy), 0).rgb;
        let normal = textureSampleLevel(normalMap, linearSampler, _arg_0.uv, 1).xyz;
        let depth = textureSampleLevel(depthMap, linearSampler, _arg_0.uv, 1).r;
        let normalDiff = ((fwidth(normal.x) + fwidth(normal.y)) + fwidth(normal.z));
        let edge = saturate(((fwidth(depth) * 0.02f) + (normalDiff * 0.5f)));
        let color = mix(albedo, vec3f(0.13333334028720856), edge);
        return (vec4f(color, 1f) * fadeInUniform);
      }"
    `);
  });
});
