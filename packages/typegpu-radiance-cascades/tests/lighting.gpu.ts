import { d, std, type SampledFlag, type TgpuRoot, type TgpuTexture } from 'typegpu';
import { gpuIt } from 'typegpu-testing-utility/gpu';
import { describe, expect } from 'vitest';
import * as hrc from '../src/holographic/index.ts';
import * as rc from '../src/index.ts';

type Readable = TgpuTexture<{ size: [number, number]; format: 'rgba16float' }> & SampledFlag;

async function readRgb(root: TgpuRoot, texture: Readable) {
  const [width, height] = texture.props.size;
  const view = texture.createView(d.texture2d(d.f32));
  const out = root.createMutable(d.arrayOf(d.vec4f, width * height));
  root
    .createGuardedComputePipeline((x, y) => {
      'use gpu';
      out.$[y * width + x] = std.textureLoad(view.$, d.vec2u(x, y), 0);
    })
    .dispatchThreads(width, height);
  const values = (await out.read()).flatMap((v) => [v.x, v.y, v.z]);
  out.buffer.destroy();
  return values;
}

function stepInto(
  root: TgpuRoot,
  instance: { step: (pass: GPUComputePassEncoder) => void },
  times: number,
) {
  const encoder = root.device.createCommandEncoder();
  const pass = encoder.beginComputePass();
  for (let i = 0; i < times; i++) instance.step(pass);
  pass.end();
  root.device.queue.submit([encoder.finish()]);
}

describe('holographic lighting on a real device', () => {
  gpuIt('converges to emission / extinction inside a uniform medium', async ({ root }) => {
    const lighting = hrc.defineAndInstantiate(
      root,
      {
        medium: () => {
          'use gpu';
          return { emission: d.vec3f(2, 1, 0.5), extinction: 1 };
        },
      },
      { size: { width: 64, height: 48 } },
    );
    stepInto(root, lighting, 1);

    const rgb = await readRgb(root, lighting.output);
    const center = (24 * 64 + 32) * 3;
    expect(rgb[center]).toBeCloseTo(2, 1);
    expect(rgb[center + 1]).toBeCloseTo(1, 1);
    expect(rgb[center + 2]).toBeCloseTo(0.5, 1);
    lighting.destroy();
  });

  gpuIt('does the full work when stepped twice into one pass', async ({ root }) => {
    const options: hrc.HolographicOptions = {
      transmission: 'rgb',
      medium: (pixel) => {
        'use gpu';
        const inside = std.length(d.vec2f(pixel) - d.vec2f(20, 12)) < 4;
        return {
          emission: std.select(d.vec3f(0.01), d.vec3f(16, 8, 4), inside),
          extinction: std.select(d.vec3f(0.05, 0.1, 0.2), d.vec3f(16), inside),
        };
      },
      source: (_pixel, incident) => {
        'use gpu';
        return incident * 0.05;
      },
    };
    const definition = hrc.define(root, options);
    const once = hrc.instantiate(root, definition, {
      size: { width: 37, height: 29 },
      iterations: 2,
    });
    const twice = hrc.instantiate(root, definition, {
      size: { width: 37, height: 29 },
      iterations: 2,
    });
    stepInto(root, once, 1);
    stepInto(root, twice, 2);

    const expected = await readRgb(root, once.output);
    expect(Math.max(...expected)).toBeGreaterThan(0.1);
    expect(await readRgb(root, twice.output)).toEqual(expected);
  });
});

describe('sdf lighting on a real device', () => {
  gpuIt('does the full work when stepped twice into one pass', async ({ root }) => {
    const definition = rc.define(root, {
      sdf: (uv) => {
        'use gpu';
        return std.length(uv - d.vec2f(0.3, 0.5)) - 0.08;
      },
      emission: () => {
        'use gpu';
        return d.vec3f(1, 0.5, 0.25);
      },
      mergeMode: 'bilinear-fix',
    });
    const io = { size: { width: 80, height: 48 }, sdfResolution: { width: 160, height: 96 } };
    const once = rc.instantiate(root, definition, io);
    const twice = rc.instantiate(root, definition, io);
    stepInto(root, once, 1);
    stepInto(root, twice, 2);

    const expected = await readRgb(root, once.output);
    expect(Math.max(...expected)).toBeGreaterThan(0.1);
    expect(await readRgb(root, twice.output)).toEqual(expected);
  });
});
