/**
 * @vitest-environment jsdom
 */

import { describe, expect } from 'vitest';
import { it } from '../../utils/extendedIt.ts';
import { runExampleTest, setupCommonMocks } from '../utils/baseTest.ts';

describe('game of life example', () => {
  setupCommonMocks();

  it('should produce valid code', async ({ device }) => {
    const shaderCodes = await runExampleTest({
      category: 'simulation',
      name: 'game-of-life',
      controlTriggers: ['Test Resolution'],
      expectedCalls: 5,
    }, device);

    expect(shaderCodes).toMatchInlineSnapshot(`
      "@group(0) @binding(0) var<uniform> sizeUniform: vec3u;

      @group(0) @binding(1) var<uniform> gameSizeUniform: u32;

      @group(0) @binding(2) var<uniform> timeUniform: f32;

      var<private> seed: vec2f;

      fn seed2(value: vec2f) {
        seed = value;
      }

      fn randSeed2(seed: vec2f) {
        seed2(seed);
      }

      fn sample() -> f32 {
        let a = dot(seed, vec2f(23.140779495239258, 232.6168975830078));
        let b = dot(seed, vec2f(54.47856521606445, 345.8415222167969));
        seed.x = fract((cos(a) * 136.8168f));
        seed.y = fract((cos(b) * 534.7645f));
        return seed.y;
      }

      fn randFloat01() -> f32 {
        return sample();
      }

      @group(1) @binding(1) var next: texture_storage_2d<r32uint, write>;

      fn wrappedCallback(x: u32, y: u32, _arg_2: u32) {
        randSeed2(((vec2f(f32(x), f32(y)) / f32(gameSizeUniform)) * timeUniform));
        textureStore(next, vec2u(x, y), vec4u(u32(select(0, 1, (randFloat01() > 0.5f))), 0u, 0u, 0u));
      }

      struct mainCompute_Input {
        @builtin(global_invocation_id) id: vec3u,
      }

      @compute @workgroup_size(16, 16, 1) fn mainCompute(in: mainCompute_Input)  {
        if (any(in.id >= sizeUniform)) {
          return;
        }
        wrappedCallback(in.id.x, in.id.y, in.id.z);
      }

      @group(0) @binding(0) var<uniform> gameSizeUniform: u32;

      @group(1) @binding(0) var current: texture_2d<u32>;

      fn loadTexAt(pos: vec2u) -> u32 {
        return textureLoad(current, pos, 0).x;
      }

      @group(1) @binding(1) var next: texture_storage_2d<r32uint, write>;

      struct naiveCompute_Input {
        @builtin(global_invocation_id) gid: vec3u,
      }

      @compute @workgroup_size(16, 16) fn naiveCompute(_arg_0: naiveCompute_Input) {
        let gs = gameSizeUniform;
        let vmax = (gs - 1u);
        var p = _arg_0.gid.xy;
        var neighbors = 0u;
        for (var oy = -1; (oy <= 1i); oy++) {
          for (var ox = -1; (ox <= 1i); ox++) {
            if (((ox == 0i) && (oy == 0i))) {
              continue;
            }
            let nx = (i32(p.x) + ox);
            let ny = (i32(p.y) + oy);
            let ok = ((((nx >= 0i) && (ny >= 0i)) && (nx <= i32(vmax))) && (ny <= i32(vmax)));
            let sample = (loadTexAt(vec2u(select(0u, u32(nx), ok), select(0u, u32(ny), ok))) * select(0u, 1u, ok));
            neighbors = (neighbors + sample);
          }
        }
        let self_1 = loadTexAt(p);
        let alive = (self_1 != 0u);
        let outAlive = ((alive && ((neighbors == 2u) || (neighbors == 3u))) || (!alive && (neighbors == 3u)));
        textureStore(next, p, vec4u(select(0u, 1u, outAlive), 0u, 0u, 0u));
      }

      @group(0) @binding(0) var<uniform> gameSizeUniform: u32;

      @group(1) @binding(0) var current: texture_2d<u32>;

      @group(1) @binding(2) var sampler_1: sampler;

      fn tileIdx(x: u32, y: u32) -> u32 {
        return ((y * 18u) + x);
      }

      var<workgroup> sharedTile: array<u32, 324>;

      fn readTile(x: u32, y: u32) -> u32 {
        return sharedTile[tileIdx(x, y)];
      }

      fn countNeighborsInTile(x: u32, y: u32) -> u32 {
        return (((((((readTile((x - 1u), (y - 1u)) + readTile(x, (y - 1u))) + readTile((x + 1u), (y - 1u))) + readTile((x - 1u), y)) + readTile((x + 1u), y)) + readTile((x - 1u), (y + 1u))) + readTile(x, (y + 1u))) + readTile((x + 1u), (y + 1u)));
      }

      fn golNextState(alive: bool, neighbors: u32) -> bool {
        return ((alive && ((neighbors == 2u) || (neighbors == 3u))) || (!alive && (neighbors == 3u)));
      }

      @group(1) @binding(1) var next: texture_storage_2d<r32uint, write>;

      struct tiledCompute_Input {
        @builtin(global_invocation_id) gid: vec3u,
        @builtin(local_invocation_id) lid: vec3u,
        @builtin(workgroup_id) wgid: vec3u,
      }

      @compute @workgroup_size(16, 16) fn tiledCompute(_arg_0: tiledCompute_Input) {
        let gs = f32(gameSizeUniform);
        var texelSize = (vec2f(1) / gs);
        var tileOrigin = ((vec2f(_arg_0.wgid.xy) * 16f) - 1f);
        let linearId = ((_arg_0.lid.y * 16u) + _arg_0.lid.x);
        const numGathers = 81u;
        if ((linearId < numGathers)) {
          let gx = (linearId % 9u);
          let gy = u32((f32(linearId) / 9f));
          let sx = (gx * 2u);
          let sy = (gy * 2u);
          var uv = ((tileOrigin + vec2f(f32((sx + 1u)), f32((sy + 1u)))) * texelSize);
          var g = textureGather(0i, current, sampler_1, uv);
          sharedTile[tileIdx(sx, sy)] = g.w;
          sharedTile[tileIdx((sx + 1u), sy)] = g.z;
          sharedTile[tileIdx(sx, (sy + 1u))] = g.x;
          sharedTile[tileIdx((sx + 1u), (sy + 1u))] = g.y;
        }
        workgroupBarrier();
        let lx = (_arg_0.lid.x + 1u);
        let ly = (_arg_0.lid.y + 1u);
        let current_1 = readTile(lx, ly);
        let neighbors = countNeighborsInTile(lx, ly);
        let nextAlive = golNextState((current_1 != 0u), neighbors);
        textureStore(next, _arg_0.gid.xy, vec4u(u32(select(0, 1, nextAlive)), 0u, 0u, 0u));
      }

      @group(0) @binding(0) var<uniform> gameSizeUniform: u32;

      @group(1) @binding(0) var current: texture_2d<u32>;

      @group(1) @binding(2) var sampler_1: sampler;

      fn tileIdx(x: u32, y: u32) -> u32 {
        return ((y * 18u) + x);
      }

      var<workgroup> sharedTile: array<u32, 324>;

      fn readTile(x: u32, y: u32) -> u32 {
        return sharedTile[tileIdx(x, y)];
      }

      fn countNeighborsInTile(x: u32, y: u32) -> u32 {
        return (((((((readTile((x - 1u), (y - 1u)) + readTile(x, (y - 1u))) + readTile((x + 1u), (y - 1u))) + readTile((x - 1u), y)) + readTile((x + 1u), y)) + readTile((x - 1u), (y + 1u))) + readTile(x, (y + 1u))) + readTile((x + 1u), (y + 1u)));
      }

      fn golNextState(alive: bool, neighbors: u32) -> bool {
        return ((alive && ((neighbors == 2u) || (neighbors == 3u))) || (!alive && (neighbors == 3u)));
      }

      @group(1) @binding(1) var next: texture_storage_2d<r32uint, write>;

      struct tiledCompute_Input {
        @builtin(global_invocation_id) gid: vec3u,
        @builtin(local_invocation_id) lid: vec3u,
        @builtin(workgroup_id) wgid: vec3u,
      }

      @compute @workgroup_size(16, 16) fn tiledCompute(_arg_0: tiledCompute_Input) {
        let gs = f32(gameSizeUniform);
        var texelSize = (vec2f(1) / gs);
        var tileOrigin = ((vec2f(_arg_0.wgid.xy) * 16f) - 1f);
        let linearId = ((_arg_0.lid.y * 16u) + _arg_0.lid.x);
        const numGathers = 81u;
        if ((linearId < numGathers)) {
          let gx = (linearId % 9u);
          let gy = u32((f32(linearId) / 9f));
          let sx = (gx * 2u);
          let sy = (gy * 2u);
          var uv = ((tileOrigin + vec2f(f32((sx + 1u)), f32((sy + 1u)))) * texelSize);
          var g = textureGather(0i, current, sampler_1, uv);
          sharedTile[tileIdx(sx, sy)] = g.w;
          sharedTile[tileIdx((sx + 1u), sy)] = g.z;
          sharedTile[tileIdx(sx, (sy + 1u))] = g.x;
          sharedTile[tileIdx((sx + 1u), (sy + 1u))] = g.y;
        }
        workgroupBarrier();
        let lx = (_arg_0.lid.x + 1u);
        let ly = (_arg_0.lid.y + 1u);
        let current_1 = readTile(lx, ly);
        let neighbors = countNeighborsInTile(lx, ly);
        let nextAlive = golNextState((current_1 != 0u), neighbors);
        textureStore(next, _arg_0.gid.xy, vec4u(u32(select(0, 1, nextAlive)), 0u, 0u, 0u));
      }

      struct fullScreenTriangle_Input {
        @builtin(vertex_index) vertexIndex: u32,
      }

      struct fullScreenTriangle_Output {
        @builtin(position) pos: vec4f,
        @location(0) uv: vec2f,
      }

      @vertex fn fullScreenTriangle(in: fullScreenTriangle_Input) -> fullScreenTriangle_Output {
        const pos = array<vec2f, 3>(vec2f(-1, -1), vec2f(3, -1), vec2f(-1, 3));
        const uv = array<vec2f, 3>(vec2f(0, 1), vec2f(2, 1), vec2f(0, -1));

        return fullScreenTriangle_Output(vec4f(pos[in.vertexIndex], 0, 1), uv[in.vertexIndex]);
      }

      struct ZoomParams {
        enabled: u32,
        level: f32,
        centerX: f32,
        centerY: f32,
      }

      @group(0) @binding(0) var<uniform> zoomUniform: ZoomParams;

      @group(0) @binding(1) var<uniform> gameSizeUniform: u32;

      fn sdRoundedBox2d(point: vec2f, size: vec2f, cornerRadius: f32) -> f32 {
        var d = ((abs(point) - size) + vec2f(cornerRadius));
        return ((length(max(d, vec2f())) + min(max(d.x, d.y), 0f)) - cornerRadius);
      }

      @group(1) @binding(0) var source: texture_storage_2d<r32uint, read>;

      fn sampleRegular(sampleUv: vec2f, gs: f32) -> u32 {
        return textureLoad(source, vec2u((sampleUv * gs))).x;
      }

      @group(0) @binding(2) var<uniform> viewModeUniform: u32;

      struct displayFragment_Input {
        @location(0) uv: vec2f,
      }

      @fragment fn displayFragment(_arg_0: displayFragment_Input) -> @location(0) vec4f {
        let zoom = (&zoomUniform);
        let gs = f32(gameSizeUniform);
        let halfView = (0.5f / (*zoom).level);
        var clampedCenter = clamp(vec2f((*zoom).centerX, (*zoom).centerY), vec2f(halfView), vec2f((1f - halfView)));
        var minimapMin = vec2f(0.7799999713897705);
        var minimapMax = vec2f(0.9800000190734863);
        const minimapSize = 0.2;
        let inMinimap = ((((((*zoom).enabled == 1u) && (_arg_0.uv.x >= minimapMin.x)) && (_arg_0.uv.x <= minimapMax.x)) && (_arg_0.uv.y >= minimapMin.y)) && (_arg_0.uv.y <= minimapMax.y));
        if (inMinimap) {
          var localUv = ((_arg_0.uv - minimapMin) / minimapSize);
          let edgeDist = sdRoundedBox2d((localUv - 0.5f), vec2f(0.5), 0.02f);
          if ((edgeDist > -0.02f)) {
            let alpha = (1f - smoothstep(0f, 0.02f, edgeDist));
            return vec4f(0.5f, 0.5f, 0.5f, alpha);
          }
          let viewSize = (1f / (*zoom).level);
          let dist = sdRoundedBox2d((localUv - clampedCenter), vec2f((viewSize / 2f)), 0.01f);
          const borderWidth = 0.015;
          if (((dist > -(borderWidth)) && (dist < borderWidth))) {
            var borderColor = mix(vec4f(0.7689999938011169, 0.3919999897480011, 1, 1), vec4f(0.11400000005960464, 0.44699999690055847, 0.9409999847412109, 1), localUv.x);
            let a = (1f - smoothstep(0f, borderWidth, abs(dist)));
            return vec4f(borderColor.x, borderColor.y, borderColor.z, a);
          }
          let value2 = sampleRegular(localUv, gs);
          var alive2 = select(vec4f((localUv.x / 2.5f), (localUv.y / 2.5f), ((1f - localUv.x) / 2.5f), 0.8f), vec4f(0.6000000238418579, 0.6000000238418579, 0.6000000238418579, 0.800000011920929), (viewModeUniform == 1u));
          return select(vec4f(0, 0, 0, 0.800000011920929), alive2, (value2 == 1u));
        }
        var sampleUv = _arg_0.uv;
        if (((*zoom).enabled == 1u)) {
          sampleUv = (((_arg_0.uv - 0.5f) / (*zoom).level) + clampedCenter);
        }
        let value = sampleRegular(sampleUv, gs);
        let isClassic = (viewModeUniform == 1u);
        var alive = select(normalize(vec4f((sampleUv.x / 1.5f), (sampleUv.y / 1.5f), (1f - (sampleUv.x / 1.5f)), 1f)), vec4f(1), isClassic);
        var dead = select(vec4f(), vec4f(0, 0, 0, 1), isClassic);
        return select(dead, alive, (value == 1u));
      }"
    `);
  });
});
