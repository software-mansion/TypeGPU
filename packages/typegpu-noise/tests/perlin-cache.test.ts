import { d, tgpu } from 'typegpu';
import { describe, expect, vi } from 'vitest';
import {
  expectRecordingOnly,
  it,
  type ModuleNamespace,
  recordCommands,
} from 'typegpu-testing-utility';
import { perlin2d, perlin3d } from '../src/index.ts';
import * as perlin2dCache from '../src/perlin-2d/cache/index.ts';
import * as perlin3dCache from '../src/perlin-3d/cache/index.ts';

perlin2dCache satisfies ModuleNamespace<
  perlin2d.cache.Perlin2DCacheOptions,
  perlin2d.cache.Perlin2DCacheIo,
  perlin2d.cache.Perlin2DCacheDefinition,
  perlin2d.cache.Perlin2DCacheInstance
>;

perlin3dCache satisfies ModuleNamespace<
  perlin3d.cache.Perlin3DCacheOptions,
  perlin3d.cache.Perlin3DCacheIo,
  perlin3d.cache.Perlin3DCacheDefinition,
  perlin3d.cache.Perlin3DCacheInstance
>;

describe('perlin2d.cache', () => {
  it('defines plain data', ({ root }) => {
    const definition = perlin2d.cache.define(root, {});

    for (const value of Object.values(definition)) {
      // Pipelines are callable-free objects, layouts too. Nothing in the definition is a function.
      expect(typeof value).not.toBe('function');
    }
    expect(definition.layout).toBe(perlin2d.cache.define(root, {}).layout);
  });

  it('does no GPU work while defining and instantiating', ({ root, device }) => {
    const definition = perlin2d.cache.define(root, {});
    perlin2d.cache.instantiate(root, definition, { size: d.vec2u(16, 16) });

    expect(device.mock.queue.submit).not.toHaveBeenCalled();
  });

  it('only records when stepping', ({
    root,
    device,
    commandEncoder,
    computePassEncoder,
    renderPassEncoder,
  }) => {
    const cache = perlin2d.cache.defineAndInstantiate(root, {}, { size: d.vec2u(20, 9) });
    const encoder = root.createCommandEncoder();
    const pass = encoder.beginComputePass();

    expectRecordingOnly({ device, commandEncoder, computePassEncoder, renderPassEncoder }, () =>
      cache.step(pass),
    );

    const calls = recordCommands(
      { device, commandEncoder, computePassEncoder, renderPassEncoder },
      () => cache.step(pass),
    );
    expect(calls.find((call) => call.method === 'computePass.dispatchWorkgroups')?.args).toEqual([
      3,
      2,
      undefined,
    ]);
  });

  it('fills the cache in a shader that reads its size from a uniform', ({ root }) => {
    const definition = perlin2d.cache.define(root, {});
    expect(tgpu.resolve([definition.fillPipeline])).toMatchInlineSnapshot(`
      "@group(0) @binding(0) var<uniform> size_1: vec2u;

      @group(0) @binding(1) var<storage, read_write> memory: array<vec2f>;

      fn hash(value: u32) -> u32 {
        {
          var x = (value ^ (value >> 17u));
          x *= 3982152891u;
          x ^= (x >> 11u);
          x *= 2890668881u;
          x ^= (x >> 15u);
          x *= 830770091u;
          x ^= (x >> 14u);
          return x;
        }
      }

      fn scrambleSeed2(value: vec2f) -> vec2u {
        let u32Value = bitcast<vec2u>(value);
        return vec2u(hash((u32Value.x ^ 1253408251u)), hash((u32Value.y ^ 2900286023u)));
      }

      fn rotl(x: u32, k: u32) -> u32 {
        return ((x << k) | (x >> (32u - k)));
      }

      var<private> gpuSeed: vec2u;

      fn seed2(value: vec2f) {
        let scrambled = scrambleSeed2(value);
        let newSeed = vec2u(hash((scrambled.x ^ scrambled.y)), hash((rotl(scrambled.x, 16u) ^ scrambled.y)));
        gpuSeed = newSeed;
      }

      fn randSeed2(seed: vec2f) {
        seed2(seed);
      }

      fn next() -> u32 {
        {
          let s0 = gpuSeed.x;
          var s1 = gpuSeed.y;
          s1 ^= s0;
          gpuSeed.x = ((rotl(s0, 26u) ^ s1) ^ (s1 << 9u));
          gpuSeed.y = rotl(s1, 13u);
          return (rotl((gpuSeed.x * 2654435771u), 5u) * 5u);
        }
      }

      fn u32To01F32(value: u32) -> f32 {
        let mantissa = (value & 8388607u);
        let bits = (1065353216u | mantissa);
        let f = bitcast<f32>(bits);
        return (f - 1f);
      }

      fn sample() -> f32 {
        let r = next();
        return u32To01F32(r);
      }

      fn randOnUnitCircle() -> vec2f {
        let angle = (sample() * 6.283185307179586f);
        return vec2f(cos(angle), sin(angle));
      }

      fn computeJunctionGradient(pos: vec2i) -> vec2f {
        randSeed2((1e-3f * vec2f(pos)));
        return randOnUnitCircle();
      }

      @compute @workgroup_size(8, 8) fn fill(@builtin(global_invocation_id) gid: vec3u) {
        let size = (&size_1);
        if (((gid.x >= (*size).x) || (gid.y >= (*size).y))) {
          return;
        }
        memory[(gid.x + (gid.y * (*size).x))] = computeJunctionGradient(vec2i(gid.xy));
      }"
    `);
  });

  it('samples from the cache through the layout', () => {
    const main = tgpu.fn(
      [],
      d.f32,
    )(() => {
      'use gpu';
      return perlin2d.sample(d.vec2f(1.5, 2.5));
    });

    expect(
      tgpu.resolve([main], {
        config: (cfg) =>
          cfg.with(perlin2d.getJunctionGradientSlot, perlin2d.getCachedJunctionGradient),
      }),
    ).toMatchInlineSnapshot(`
      "fn quinticInterpolation(t: vec2f) -> vec2f {
        return (((t * t) * t) * ((t * ((t * 6f) - 15f)) + 10f));
      }

      @group(0) @binding(0) var<uniform> size: vec2u;

      @group(0) @binding(1) var<storage, read> memory: array<vec2f>;

      fn getCachedJunctionGradient(pos: vec2i) -> vec2f {
        let size_1 = vec2i(size);
        let x = (((pos.x % size_1.x) + size_1.x) % size_1.x);
        let y = (((pos.y % size_1.y) + size_1.y) % size_1.y);
        return memory[(x + (y * size_1.x))];
      }

      fn sample(pos: vec2f) -> f32 {
        let i = vec2i(floor(pos));
        let f = fract(pos);
        let u = quinticInterpolation(f);
        let ga = getCachedJunctionGradient(i);
        let gb = getCachedJunctionGradient((i + vec2i(1, 0)));
        let gc = getCachedJunctionGradient((i + vec2i(0, 1)));
        let gd = getCachedJunctionGradient((i + vec2i(1)));
        let va = dot(ga, (f - vec2f()));
        let vb = dot(gb, (f - vec2f(1, 0)));
        let vc = dot(gc, (f - vec2f(0, 1)));
        let vd = dot(gd, (f - vec2f(1)));
        let noise = (((va + (u.x * (vb - va))) + (u.y * (vc - va))) + ((u.x * u.y) * (((va - vb) - vc) + vd)));
        return noise;
      }

      fn main() -> f32 {
        return sample(vec2f(1.5, 2.5));
      }"
    `);
  });

  it('validates the size', ({ root }) => {
    const definition = perlin2d.cache.define(root, {});
    expect(() =>
      perlin2d.cache.instantiate(root, definition, { size: d.vec2u(0, 4) }),
    ).toThrowErrorMatchingInlineSnapshot(
      `[Error: perlin2d.cache: size has to be made of positive integers, got (0, 4)]`,
    );
  });

  it('destroys what it made, once', ({ root }) => {
    const cache = perlin2d.cache.defineAndInstantiate(root, {}, { size: d.vec2u(4, 4) });
    const sizeDestroy = vi.spyOn(cache.buffers.size, 'destroy');
    const memoryDestroy = vi.spyOn(cache.buffers.memory, 'destroy');

    cache.destroy();
    cache[Symbol.dispose]();

    expect(sizeDestroy).toHaveBeenCalledTimes(1);
    expect(memoryDestroy).toHaveBeenCalledTimes(1);

    const pass = root.createCommandEncoder().beginComputePass();
    expect(() => cache.step(pass)).toThrowErrorMatchingInlineSnapshot(
      `[Error: perlin2d.cache: 'step' was called after 'destroy()']`,
    );
    expect(() => cache.initSync()).toThrow(/perlin2d\.cache/);
  });
});

describe('perlin3d.cache', () => {
  it('only records when stepping', ({
    root,
    device,
    commandEncoder,
    computePassEncoder,
    renderPassEncoder,
  }) => {
    const cache = perlin3d.cache.defineAndInstantiate(root, {}, { size: d.vec3u(5, 8, 9) });
    const encoder = root.createCommandEncoder();
    const pass = encoder.beginComputePass();

    expectRecordingOnly({ device, commandEncoder, computePassEncoder, renderPassEncoder }, () =>
      cache.step(pass),
    );

    const calls = recordCommands(
      { device, commandEncoder, computePassEncoder, renderPassEncoder },
      () => cache.step(pass),
    );
    expect(calls.find((call) => call.method === 'computePass.dispatchWorkgroups')?.args).toEqual([
      2, 2, 3,
    ]);
  });

  it('fills the cache in a shader that reads its size from a uniform', ({ root }) => {
    const definition = perlin3d.cache.define(root, {});
    expect(tgpu.resolve([definition.fillPipeline])).toMatchInlineSnapshot(`
      "@group(0) @binding(0) var<uniform> size_1: vec4u;

      @group(0) @binding(1) var<storage, read_write> memory: array<vec3f>;

      fn hash(value: u32) -> u32 {
        {
          var x = (value ^ (value >> 17u));
          x *= 3982152891u;
          x ^= (x >> 11u);
          x *= 2890668881u;
          x ^= (x >> 15u);
          x *= 830770091u;
          x ^= (x >> 14u);
          return x;
        }
      }

      fn scrambleSeed3(value: vec3f) -> vec3u {
        let u32Value = bitcast<vec3u>(value);
        return vec3u(hash((u32Value.x ^ 1253408251u)), hash((u32Value.y ^ 2900286023u)), hash((u32Value.z ^ 3164612939u)));
      }

      fn rotl(x: u32, k: u32) -> u32 {
        return ((x << k) | (x >> (32u - k)));
      }

      var<private> gpuSeed: vec2u;

      fn seed3(value: vec3f) {
        let scrambled = scrambleSeed3(value);
        let newSeed = vec2u(hash((scrambled.x ^ rotl(scrambled.z, 16u))), hash((rotl(scrambled.y, 16u) ^ scrambled.z)));
        gpuSeed = newSeed;
      }

      fn randSeed3(seed: vec3f) {
        seed3(seed);
      }

      fn next() -> u32 {
        {
          let s0 = gpuSeed.x;
          var s1 = gpuSeed.y;
          s1 ^= s0;
          gpuSeed.x = ((rotl(s0, 26u) ^ s1) ^ (s1 << 9u));
          gpuSeed.y = rotl(s1, 13u);
          return (rotl((gpuSeed.x * 2654435771u), 5u) * 5u);
        }
      }

      fn u32To01F32(value: u32) -> f32 {
        let mantissa = (value & 8388607u);
        let bits = (1065353216u | mantissa);
        let f = bitcast<f32>(bits);
        return (f - 1f);
      }

      fn sample() -> f32 {
        let r = next();
        return u32To01F32(r);
      }

      fn randOnUnitSphere() -> vec3f {
        let z = ((2f * sample()) - 1f);
        let oneMinusZSq = sqrt((1f - (z * z)));
        let theta = (6.283185307179586f * sample());
        let x = (cos(theta) * oneMinusZSq);
        let y = (sin(theta) * oneMinusZSq);
        return vec3f(x, y, z);
      }

      fn computeJunctionGradient(pos: vec3i) -> vec3f {
        randSeed3((1e-3f * vec3f(pos)));
        return randOnUnitSphere();
      }

      @compute @workgroup_size(4, 4, 4) fn fill(@builtin(global_invocation_id) gid: vec3u) {
        let size = (&size_1);
        if ((((gid.x >= (*size).x) || (gid.y >= (*size).y)) || (gid.z >= (*size).z))) {
          return;
        }
        let idx = ((gid.x + (gid.y * (*size).x)) + ((gid.z * (*size).x) * (*size).y));
        memory[idx] = computeJunctionGradient(vec3i(gid));
      }"
    `);
  });

  it('pads the size uniform to a vec4u', ({ root }) => {
    const cache = perlin3d.cache.defineAndInstantiate(root, {}, { size: d.vec3u(2, 3, 4) });
    expect(cache.size).toEqual(d.vec3u(2, 3, 4));
    expect(cache.buffers.size.dataType).toBe(d.vec4u);
  });

  it('destroys what it made, once', ({ root }) => {
    const cache = perlin3d.cache.defineAndInstantiate(root, {}, { size: d.vec3u(4) });
    const memoryDestroy = vi.spyOn(cache.buffers.memory, 'destroy');

    cache[Symbol.dispose]();
    cache.destroy();

    expect(memoryDestroy).toHaveBeenCalledTimes(1);
    const pass = root.createCommandEncoder().beginComputePass();
    expect(() => cache.step(pass)).toThrow(/perlin3d\.cache/);
  });
});

describe('deprecated factories', () => {
  it('perlin2d.staticCache fills the cache right away', ({ root, device }) => {
    const cache = perlin2d.staticCache({ root, size: d.vec2u(4, 4) });
    expect(device.mock.queue.submit).toHaveBeenCalledTimes(1);
    expect(cache.size).toEqual(d.vec2u(4, 4));
    cache.destroy();
  });

  it('perlin3d.dynamicCacheConfig refills after a resize', ({ root, device }) => {
    const config = perlin3d.dynamicCacheConfig();
    const cache = config.instance(root, d.vec3u(4, 4, 1));
    expect(device.mock.queue.submit).toHaveBeenCalledTimes(1);

    cache.size = d.vec3u(8, 8, 1);
    expect(device.mock.queue.submit).toHaveBeenCalledTimes(1);
    expect(Object.keys(cache.bindings)).toEqual(['perlin3dCache__size', 'perlin3dCache__memory']);
    expect(device.mock.queue.submit).toHaveBeenCalledTimes(2);
    expect(cache.size).toEqual(d.vec3u(8, 8, 1));
    cache.destroy();
  });
});
