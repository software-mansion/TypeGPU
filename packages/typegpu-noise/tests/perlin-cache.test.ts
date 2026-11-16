import { d, tgpu } from 'typegpu';
import { describe, expect, vi } from 'vitest';
import {
  expectRecordingOnly,
  it,
  type ModuleNamespace,
  recordCommands,
} from 'typegpu-testing-utility';
import { perlin2d, perlin3d } from '../src/index.ts';
import * as perlin2dDynamicCache from '../src/perlin-2d/dynamic-cache/index.ts';
import * as perlin2dStaticCache from '../src/perlin-2d/static-cache/index.ts';
import * as perlin3dDynamicCache from '../src/perlin-3d/dynamic-cache/index.ts';
import * as perlin3dStaticCache from '../src/perlin-3d/static-cache/index.ts';

perlin2dDynamicCache satisfies ModuleNamespace<
  perlin2d.dynamicCache.Perlin2DDynamicCacheOptions,
  perlin2d.dynamicCache.Perlin2DDynamicCacheIo,
  perlin2d.dynamicCache.Perlin2DDynamicCacheDefinition,
  perlin2d.dynamicCache.Perlin2DDynamicCacheInstance
>;

perlin3dDynamicCache satisfies ModuleNamespace<
  perlin3d.dynamicCache.Perlin3DDynamicCacheOptions,
  perlin3d.dynamicCache.Perlin3DDynamicCacheIo,
  perlin3d.dynamicCache.Perlin3DDynamicCacheDefinition,
  perlin3d.dynamicCache.Perlin3DDynamicCacheInstance
>;

type Perlin2DStaticCacheNamespace = ModuleNamespace<
  perlin2d.Perlin2DStaticCacheOptions,
  perlin2d.Perlin2DStaticCacheIo,
  perlin2d.Perlin2DStaticCacheDefinition,
  perlin2d.Perlin2DStaticCacheInstance
>;

type Perlin3DStaticCacheNamespace = ModuleNamespace<
  perlin3d.Perlin3DStaticCacheOptions,
  perlin3d.Perlin3DStaticCacheIo,
  perlin3d.Perlin3DStaticCacheDefinition,
  perlin3d.Perlin3DStaticCacheInstance
>;

perlin2dStaticCache satisfies Perlin2DStaticCacheNamespace;
perlin3dStaticCache satisfies Perlin3DStaticCacheNamespace;
// The public `staticCache` is still callable (deprecated), and carries the module on top of that
perlin2d.staticCache satisfies Perlin2DStaticCacheNamespace;
perlin3d.staticCache satisfies Perlin3DStaticCacheNamespace;

const sample2d = tgpu.fn(
  [],
  d.f32,
)(() => {
  'use gpu';
  return perlin2d.sample(d.vec2f(1.5, 2.5));
});

const sample3d = tgpu.fn(
  [],
  d.f32,
)(() => {
  'use gpu';
  return perlin3d.sample(d.vec3f(1.5, 2.5, 3.5));
});

describe('perlin2d.dynamicCache', () => {
  it('defines plain data, plus `inject`', ({ root }) => {
    const definition = perlin2d.dynamicCache.define(root, {});

    for (const [key, value] of Object.entries(definition)) {
      // Pipelines are callable-free objects, layouts too. `inject` is the only function.
      expect(typeof value, key).toBe(key === 'inject' ? 'function' : 'object');
    }
    expect(definition.layout).toBe(perlin2d.dynamicCache.define(root, {}).layout);
  });

  it('gives its definition back', ({ root }) => {
    const definition = perlin2d.dynamicCache.define(root, {});
    const cache = perlin2d.dynamicCache.instantiate(root, definition, { size: d.vec2u(16, 16) });

    expect(cache.definition).toBe(definition);
    expect(cache.bindGroup.layout).toBe(definition.layout);
    expect(
      perlin2d.dynamicCache.defineAndInstantiate(root, {}, { size: d.vec2u(4) }).definition.layout,
    ).toBe(definition.layout);
  });

  it('does no GPU work while defining and instantiating', ({ root, device }) => {
    const definition = perlin2d.dynamicCache.define(root, {});
    perlin2d.dynamicCache.instantiate(root, definition, { size: d.vec2u(16, 16) });

    expect(device.mock.queue.submit).not.toHaveBeenCalled();
  });

  it('only records when stepping', ({
    root,
    device,
    commandEncoder,
    computePassEncoder,
    renderPassEncoder,
  }) => {
    const cache = perlin2d.dynamicCache.defineAndInstantiate(root, {}, { size: d.vec2u(20, 9) });
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
    const definition = perlin2d.dynamicCache.define(root, {});
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

  it('injects sampling from the cache through the layout', ({ root }) => {
    const definition = perlin2d.dynamicCache.define(root, {});
    const cache = perlin2d.dynamicCache.instantiate(root, definition, { size: d.vec2u(16, 16) });

    // Nothing size-specific is in the shader, so the instance injects the same thing
    expect(tgpu.resolve([sample2d], { config: cache.inject() })).toBe(
      tgpu.resolve([sample2d], { config: definition.inject() }),
    );
    expect(tgpu.resolve([sample2d], { config: definition.inject() })).toMatchInlineSnapshot(`
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

      fn sample2d() -> f32 {
        return sample(vec2f(1.5, 2.5));
      }"
    `);
  });

  it('validates the size', ({ root }) => {
    const definition = perlin2d.dynamicCache.define(root, {});
    expect(() =>
      perlin2d.dynamicCache.instantiate(root, definition, { size: d.vec2u(0, 4) }),
    ).toThrowErrorMatchingInlineSnapshot(
      `[Error: perlin2d.dynamicCache: size has to be made of positive integers, got (0, 4)]`,
    );
  });

  it('destroys what it made, once', ({ root }) => {
    const cache = perlin2d.dynamicCache.defineAndInstantiate(root, {}, { size: d.vec2u(4, 4) });
    const sizeDestroy = vi.spyOn(cache.buffers.size, 'destroy');
    const memoryDestroy = vi.spyOn(cache.buffers.memory, 'destroy');

    cache.destroy();
    cache[Symbol.dispose]();

    expect(sizeDestroy).toHaveBeenCalledTimes(1);
    expect(memoryDestroy).toHaveBeenCalledTimes(1);

    const pass = root.createCommandEncoder().beginComputePass();
    expect(() => cache.step(pass)).toThrowErrorMatchingInlineSnapshot(
      `[Error: perlin2d.dynamicCache: 'step' was called after 'destroy()']`,
    );
    expect(() => cache.initSync()).toThrow(/perlin2d\.dynamicCache/);
  });
});

describe('perlin3d.dynamicCache', () => {
  it('only records when stepping', ({
    root,
    device,
    commandEncoder,
    computePassEncoder,
    renderPassEncoder,
  }) => {
    const cache = perlin3d.dynamicCache.defineAndInstantiate(root, {}, { size: d.vec3u(5, 8, 9) });
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
    const definition = perlin3d.dynamicCache.define(root, {});
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

  it('injects sampling from the cache through the layout', ({ root }) => {
    const cache = perlin3d.dynamicCache.defineAndInstantiate(root, {}, { size: d.vec3u(5, 8, 9) });
    const code = tgpu.resolve([sample3d], { config: cache.inject() });

    expect(cache.definition.layout).toBe(cache.bindGroup.layout);
    expect(code).toBe(tgpu.resolve([sample3d], { config: cache.definition.inject() }));
    expect(code.slice(code.indexOf('@group'), code.indexOf('fn sample('))).toMatchInlineSnapshot(`
      "@group(0) @binding(0) var<uniform> size: vec4u;

      @group(0) @binding(1) var<storage, read> memory: array<vec3f>;

      fn getCachedJunctionGradient(pos: vec3i) -> vec3f {
        let size_1 = vec3i(size.xyz);
        let x = (((pos.x % size_1.x) + size_1.x) % size_1.x);
        let y = (((pos.y % size_1.y) + size_1.y) % size_1.y);
        let z = (((pos.z % size_1.z) + size_1.z) % size_1.z);
        return memory[((x + (y * size_1.x)) + ((z * size_1.x) * size_1.y))];
      }

      fn dotProdGrid(pos: vec3f, junction: vec3f) -> f32 {
        let relative = (pos - junction);
        let gridVector = getCachedJunctionGradient(vec3i(junction));
        return dot(relative, gridVector);
      }

      fn quinticInterpolation(t: vec3f) -> vec3f {
        return (((t * t) * t) * ((t * ((t * 6f) - 15f)) + 10f));
      }

      "
    `);
  });

  it('pads the size uniform to a vec4u', ({ root }) => {
    const cache = perlin3d.dynamicCache.defineAndInstantiate(root, {}, { size: d.vec3u(2, 3, 4) });
    expect(cache.size).toEqual(d.vec3u(2, 3, 4));
    expect(cache.buffers.size.dataType).toBe(d.vec4u);
  });

  it('destroys what it made, once', ({ root }) => {
    const cache = perlin3d.dynamicCache.defineAndInstantiate(root, {}, { size: d.vec3u(4) });
    const memoryDestroy = vi.spyOn(cache.buffers.memory, 'destroy');

    cache[Symbol.dispose]();
    cache.destroy();

    expect(memoryDestroy).toHaveBeenCalledTimes(1);
    const pass = root.createCommandEncoder().beginComputePass();
    expect(() => cache.step(pass)).toThrow(/perlin3d\.dynamicCache/);
  });
});

describe('perlin2d.staticCache', () => {
  it('defines plain data, plus `inject`', ({ root }) => {
    const definition = perlin2d.staticCache.define(root, { size: d.vec2u(20, 9) });

    for (const [key, value] of Object.entries(definition)) {
      expect(typeof value, key).toBe(key === 'inject' ? 'function' : 'object');
    }
    expect(definition.size).toEqual(d.vec2u(20, 9));
  });

  it('does no GPU work while defining and instantiating', ({ root, device }) => {
    perlin2d.staticCache.defineAndInstantiate(root, { size: d.vec2u(16, 16) }, {});

    expect(device.mock.queue.submit).not.toHaveBeenCalled();
  });

  it('gives its definition back', ({ root }) => {
    const definition = perlin2d.staticCache.define(root, { size: d.vec2u(20, 9) });
    const cache = perlin2d.staticCache.instantiate(root, definition, {});

    expect(cache.definition).toBe(definition);
    expect(cache.size).toEqual(d.vec2u(20, 9));
    expect(cache.bindGroup.layout).toBe(definition.layout);
    expect(cache.buffers.memory.dataType.elementCount).toBe(180);
  });

  it('only records when stepping', ({
    root,
    device,
    commandEncoder,
    computePassEncoder,
    renderPassEncoder,
  }) => {
    const cache = perlin2d.staticCache.defineAndInstantiate(root, { size: d.vec2u(20, 9) }, {});
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

  it('bakes the size into the shader that fills the cache', ({ root }) => {
    const definition = perlin2d.staticCache.define(root, { size: d.vec2u(20, 9) });
    const code = tgpu.resolve([definition.fillPipeline]);

    expect(code.slice(code.indexOf('@group'), code.indexOf('fn hash'))).toMatchInlineSnapshot(`
      "@group(0) @binding(0) var<storage, read_write> memory: array<vec2f, 180>;

      "
    `);
    expect(code.slice(code.indexOf('@compute'))).toMatchInlineSnapshot(`
      "@compute @workgroup_size(8, 8) fn fill(@builtin(global_invocation_id) gid: vec3u) {
        if (((gid.x >= 20u) || (gid.y >= 9u))) {
          return;
        }
        memory[(gid.x + (gid.y * 20u))] = computeJunctionGradient(vec2i(gid.xy));
      }"
    `);
  });

  it('injects sampling with the size baked in', ({ root }) => {
    const definition = perlin2d.staticCache.define(root, { size: d.vec2u(20, 9) });
    const cache = perlin2d.staticCache.instantiate(root, definition, {});

    expect(tgpu.resolve([sample2d], { config: cache.inject() })).toBe(
      tgpu.resolve([sample2d], { config: definition.inject() }),
    );
    expect(tgpu.resolve([sample2d], { config: definition.inject() })).toMatchInlineSnapshot(`
      "fn quinticInterpolation(t: vec2f) -> vec2f {
        return (((t * t) * t) * ((t * ((t * 6f) - 15f)) + 10f));
      }

      @group(0) @binding(0) var<storage, read> memory: array<vec2f, 180>;

      fn getJunctionGradient(pos: vec2i) -> vec2f {
        let size_i = vec2i(20, 9);
        let x = (((pos.x % size_i.x) + size_i.x) % size_i.x);
        let y = (((pos.y % size_i.y) + size_i.y) % size_i.y);
        return memory[(x + (y * size_i.x))];
      }

      fn sample(pos: vec2f) -> f32 {
        let i = vec2i(floor(pos));
        let f = fract(pos);
        let u = quinticInterpolation(f);
        let ga = getJunctionGradient(i);
        let gb = getJunctionGradient((i + vec2i(1, 0)));
        let gc = getJunctionGradient((i + vec2i(0, 1)));
        let gd = getJunctionGradient((i + vec2i(1)));
        let va = dot(ga, (f - vec2f()));
        let vb = dot(gb, (f - vec2f(1, 0)));
        let vc = dot(gc, (f - vec2f(0, 1)));
        let vd = dot(gd, (f - vec2f(1)));
        let noise = (((va + (u.x * (vb - va))) + (u.y * (vc - va))) + ((u.x * u.y) * (((va - vb) - vc) + vd)));
        return noise;
      }

      fn sample2d() -> f32 {
        return sample(vec2f(1.5, 2.5));
      }"
    `);
  });

  it('validates the size', ({ root }) => {
    expect(() =>
      perlin2d.staticCache.define(root, { size: d.vec2u(0, 4) }),
    ).toThrowErrorMatchingInlineSnapshot(
      `[Error: perlin2d.staticCache: size has to be made of positive integers, got (0, 4)]`,
    );
  });

  it('destroys what it made, once', ({ root }) => {
    const cache = perlin2d.staticCache.defineAndInstantiate(root, { size: d.vec2u(4, 4) }, {});
    const memoryDestroy = vi.spyOn(cache.buffers.memory, 'destroy');

    cache.destroy();
    cache[Symbol.dispose]();

    expect(memoryDestroy).toHaveBeenCalledTimes(1);

    const pass = root.createCommandEncoder().beginComputePass();
    expect(() => cache.step(pass)).toThrowErrorMatchingInlineSnapshot(
      `[Error: perlin2d.staticCache: 'step' was called after 'destroy()']`,
    );
    expect(() => cache.initSync()).toThrow(/perlin2d\.staticCache/);
  });
});

describe('perlin3d.staticCache', () => {
  it('only records when stepping', ({
    root,
    device,
    commandEncoder,
    computePassEncoder,
    renderPassEncoder,
  }) => {
    const cache = perlin3d.staticCache.defineAndInstantiate(root, { size: d.vec3u(5, 8, 9) }, {});
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

  it('bakes the size into the shader that fills the cache', ({ root }) => {
    const definition = perlin3d.staticCache.define(root, { size: d.vec3u(5, 8, 9) });
    const code = tgpu.resolve([definition.fillPipeline]);

    expect(code.slice(code.indexOf('@group'), code.indexOf('fn hash'))).toMatchInlineSnapshot(`
      "@group(0) @binding(0) var<storage, read_write> memory: array<vec3f, 360>;

      "
    `);
    expect(code.slice(code.indexOf('@compute'))).toMatchInlineSnapshot(`
      "@compute @workgroup_size(4, 4, 4) fn fill(@builtin(global_invocation_id) gid: vec3u) {
        if ((((gid.x >= 5u) || (gid.y >= 8u)) || (gid.z >= 9u))) {
          return;
        }
        let idx = ((gid.x + (gid.y * 5u)) + ((gid.z * 5u) * 8u));
        memory[idx] = computeJunctionGradient(vec3i(gid));
      }"
    `);
  });

  it('injects sampling with the size baked in', ({ root }) => {
    const definition = perlin3d.staticCache.define(root, { size: d.vec3u(5, 8, 9) });
    const cache = perlin3d.staticCache.instantiate(root, definition, {});
    const code = tgpu.resolve([sample3d], { config: cache.inject() });

    expect(code).toBe(tgpu.resolve([sample3d], { config: definition.inject() }));
    expect(code.slice(code.indexOf('@group'), code.indexOf('fn sample('))).toMatchInlineSnapshot(`
      "@group(0) @binding(0) var<storage, read> memory: array<vec3f, 360>;

      fn getJunctionGradient(pos: vec3i) -> vec3f {
        let size_i = vec3i(5, 8, 9);
        let x = (((pos.x % size_i.x) + size_i.x) % size_i.x);
        let y = (((pos.y % size_i.y) + size_i.y) % size_i.y);
        let z = (((pos.z % size_i.z) + size_i.z) % size_i.z);
        return memory[((x + (y * size_i.x)) + ((z * size_i.x) * size_i.y))];
      }

      fn dotProdGrid(pos: vec3f, junction: vec3f) -> f32 {
        let relative = (pos - junction);
        let gridVector = getJunctionGradient(vec3i(junction));
        return dot(relative, gridVector);
      }

      fn quinticInterpolation(t: vec3f) -> vec3f {
        return (((t * t) * t) * ((t * ((t * 6f) - 15f)) + 10f));
      }

      "
    `);
  });

  it('gives its definition back', ({ root }) => {
    const definition = perlin3d.staticCache.define(root, { size: d.vec3u(2, 3, 4) });
    const cache = perlin3d.staticCache.instantiate(root, definition, {});

    expect(cache.definition).toBe(definition);
    expect(cache.size).toEqual(d.vec3u(2, 3, 4));
    expect(cache.buffers.memory.dataType.elementCount).toBe(24);
  });

  it('validates the size', ({ root }) => {
    expect(() =>
      perlin3d.staticCache.define(root, { size: d.vec3u(4, 0, 2) }),
    ).toThrowErrorMatchingInlineSnapshot(
      `[Error: perlin3d.staticCache: size has to be made of positive integers, got (4, 0, 2)]`,
    );
  });

  it('destroys what it made, once', ({ root }) => {
    const cache = perlin3d.staticCache.defineAndInstantiate(root, { size: d.vec3u(4) }, {});
    const memoryDestroy = vi.spyOn(cache.buffers.memory, 'destroy');

    cache[Symbol.dispose]();
    cache.destroy();

    expect(memoryDestroy).toHaveBeenCalledTimes(1);
    const pass = root.createCommandEncoder().beginComputePass();
    expect(() => cache.step(pass)).toThrow(/perlin3d\.staticCache/);
  });
});

describe('deprecated factories', () => {
  it('calling perlin2d.staticCache fills the cache right away', ({ root, device }) => {
    const cache = perlin2d.staticCache({ root, size: d.vec2u(4, 4) });
    expect(device.mock.queue.submit).toHaveBeenCalledTimes(1);
    expect(cache.size).toEqual(d.vec2u(4, 4));
    cache.destroy();
  });

  it('calling perlin3d.staticCache injects sampling that needs no bind group', ({ root }) => {
    const cache = perlin3d.staticCache({ root, size: d.vec3u(4, 4, 2) });
    const code = tgpu.resolve([sample3d], { config: cache.inject() });

    expect(code.slice(code.indexOf('@group'), code.indexOf('fn sample('))).toMatchInlineSnapshot(`
      "@group(0) @binding(0) var<uniform> sizeBuffer: vec4u;

      @group(0) @binding(1) var<storage, read> memoryBuffer: array<vec3f, 32>;

      fn getCachedJunctionGradient(pos: vec3i) -> vec3f {
        let size = vec3i(sizeBuffer.xyz);
        let x = (((pos.x % size.x) + size.x) % size.x);
        let y = (((pos.y % size.y) + size.y) % size.y);
        let z = (((pos.z % size.z) + size.z) % size.z);
        return memoryBuffer[((x + (y * size.x)) + ((z * size.x) * size.y))];
      }

      fn getJunctionGradient(pos: vec3i) -> vec3f {
        return getCachedJunctionGradient(pos);
      }

      fn dotProdGrid(pos: vec3f, junction: vec3f) -> f32 {
        let relative = (pos - junction);
        let gridVector = getJunctionGradient(vec3i(junction));
        return dot(relative, gridVector);
      }

      fn quinticInterpolation(t: vec3f) -> vec3f {
        return (((t * t) * t) * ((t * ((t * 6f) - 15f)) + 10f));
      }

      "
    `);
    cache.destroy();
  });

  it('perlin2d.dynamicCacheConfig injects sampling through the given layout', () => {
    const config = perlin2d.dynamicCacheConfig({ prefix: 'noise_' });
    const layout = tgpu.bindGroupLayout({ ...config.layout });
    const code = tgpu.resolve([sample2d], { config: config.inject(layout.$) });

    expect(code.slice(code.indexOf('@group'), code.indexOf('fn sample('))).toMatchInlineSnapshot(`
      "@group(0) @binding(0) var<uniform> noise_size: vec2u;

      @group(0) @binding(1) var<storage, read> noise_memory: array<vec2f>;

      fn getCachedJunctionGradient(pos: vec2i) -> vec2f {
        let size = vec2i(noise_size);
        let x = (((pos.x % size.x) + size.x) % size.x);
        let y = (((pos.y % size.y) + size.y) % size.y);
        return noise_memory[(x + (y * size.x))];
      }

      "
    `);
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
