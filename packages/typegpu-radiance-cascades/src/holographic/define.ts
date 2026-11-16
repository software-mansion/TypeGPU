/* oxlint-disable typescript-eslint/no-non-null-assertion -- Indices are bounded by the cascade lattice */
import { d, std, tgpu, type TgpuComputePipeline, type TgpuRoot } from 'typegpu';
import { asRgb, createTransport } from './transport.ts';

const Medium = /*#__PURE__*/ d.struct({ emission: d.vec3f, extinction: d.f32 });
const MediumRgb = /*#__PURE__*/ d.struct({ emission: d.vec3f, extinction: d.vec3f });
type Material = { emission: d.v3f; extinction: number | d.v3f };
const hrcMedium = /*#__PURE__*/ tgpu.slot<(pixel: d.v2u) => Material>();

/** Geometry of one pyramid pass, written once per pass by the instance */
const PassParams = /*#__PURE__*/ d.struct({
  worldSize: d.vec2i,
  quadrant: d.i32,
  width: d.i32,
  height: d.i32,
  step: d.i32,
  count: d.u32,
  rowSize: d.u32,
  top: d.u32,
});

const PixelParams = /*#__PURE__*/ d.struct({
  size: d.vec2i,
  count: d.u32,
  rowSize: d.u32,
});

const unpack = (v: d.v2u) => {
  'use gpu';
  return d.vec4f(std.unpack2x16float(v.x), std.unpack2x16float(v.y));
};

const pack = (v: d.v4f) => {
  'use gpu';
  return d.vec2u(std.pack2x16float(v.xy), std.pack2x16float(v.zw));
};

/** Maps a pixel of a quadrant's rotated grid to the world grid */
const worldPixel = (p: d.v2i, size: d.v2i, quadrant: number) => {
  'use gpu';
  if (quadrant === 0) return d.vec2i(p);
  if (quadrant === 1) return d.vec2i(size.x - 1 - p.y, p.x);
  if (quadrant === 2) return d.vec2i(size.x - 1 - p.x, size.y - 1 - p.y);
  return d.vec2i(p.y, size.y - 1 - p.x);
};

const ceilDiv = (a: number, b: number) => {
  'use gpu';
  return std.intdiv(a + b - 1, b);
};

type CommonOptions = {
  /** Additional emission, evaluated once per pixel before each solve */
  source?: ((pixel: d.v2u, incident: d.v3f) => d.v3f) | undefined;
  /** Directly integrated levels before interval extension. Default: 3 */
  tracedLevels?: number | undefined;
};

/**
 * Options that change the generated shaders.
 * @category Module
 */
export type HolographicOptions = CommonOptions &
  (
    | {
        transmission?: 'scalar' | undefined;
        medium: (pixel: d.v2u) => { emission: d.v3f; extinction: number };
      }
    | { transmission: 'rgb'; medium: (pixel: d.v2u) => { emission: d.v3f; extinction: d.v3f } }
  );

/**
 * Builds the pipelines and layouts of the holographic runner. Sizes go to `instantiate`.
 * @category Module
 */
export function define(root: TgpuRoot, options: HolographicOptions) {
  const { medium, source } = options;
  const rgb = options.transmission === 'rgb';
  const hasSource = source !== undefined;
  const tracedLevels = options.tracedLevels ?? 3;
  if (!Number.isInteger(tracedLevels) || tracedLevels < 1) {
    throw new Error('tracedLevels must be a positive integer.');
  }

  const transport = createTransport(rgb);
  const Intervals = d.arrayOf(transport.Packed);
  const Fluence = d.arrayOf(d.vec2u);

  const intervals = tgpu.bindGroupLayout({
    params: { uniform: PassParams },
    source: { storage: Intervals },
    target: { storage: Intervals, access: 'mutable' },
  });
  const fluence = tgpu.bindGroupLayout({
    params: { uniform: PassParams },
    near: { storage: Intervals },
    far: { storage: Intervals },
    upper: { storage: Fluence },
    target: { storage: Fluence, access: 'mutable' },
  });
  const sectorTarget = tgpu.bindGroupLayout({
    sectors: { storageTexture: d.textureStorage2dArray('rgba16float') },
  });
  const pixels = tgpu.bindGroupLayout({
    params: { uniform: PixelParams },
  });
  const resolve = tgpu.bindGroupLayout({
    sectors: { texture: d.texture2dArray(d.f32) },
    output: { storageTexture: d.textureStorage2d('rgba16float') },
  });
  const feedback = tgpu.bindGroupLayout({
    feedback: { storage: Fluence, access: 'mutable' },
  });

  const readFeedback = (index: number) => {
    'use gpu';
    return unpack(feedback.$.feedback[index]!).rgb;
  };

  /** Reads an interval of the level below the one `intervals.$.params` describes */
  const loadInterval = (x: number, y: number, direction: number) => {
    'use gpu';
    const params = intervals.$.params;
    const height = params.height;
    const step = std.intdiv(params.step, 2);
    if (x < 0 || x >= ceilDiv(params.width, step) || y < 0 || y >= height) {
      return transport.empty();
    }
    return transport.unpack(intervals.$.source[(x * (step + 1) + direction) * height + y]!);
  };

  const readUpper = (x: number, y: number, direction: number, columns: number) => {
    'use gpu';
    const params = fluence.$.params;
    if (params.top === 1) return d.vec3f();
    if (x >= columns || y < 0 || y >= params.height) return d.vec3f();
    return unpack(fluence.$.upper[(x * params.step * 2 + direction) * params.height + y]!).rgb;
  };

  const extend = (traced: boolean) =>
    tgpu.computeFn({
      workgroupSize: [64],
      in: { gid: d.builtin.globalInvocationId },
    })(({ gid }) => {
      'use gpu';
      const params = intervals.$.params;
      const id = gid.x + gid.y * params.rowSize;
      if (id >= params.count) return;

      const width = params.width;
      const height = params.height;
      const step = params.step;
      const directions = traced ? step + 1 : std.intdiv(step, 2) + 1;
      const index32 = d.i32(id);
      const y = index32 % height;
      const direction = (std.intdiv(index32, height) % directions) * (traced ? 1 : 2);
      const x = std.intdiv(index32, height * directions);
      const index = (x * (step + 1) + direction) * height + y;

      let value = transport.empty();
      if (traced) {
        const delta = d.vec2f(d.f32(step), d.f32(2 * direction - step));
        const length = std.length(delta);
        const crossingStep = length / std.max(std.abs(delta), d.vec2f(0.00001));
        let crossing = crossingStep * 0.5;
        let pixel = d.vec2i(x * step, y);
        let distance = d.f32(0);

        for (let sample = d.i32(0); sample < step * 2 + 1; sample++) {
          if (pixel.x >= width || pixel.y < 0 || pixel.y >= height || distance >= length) break;
          const end = std.min(length, std.min(crossing.x, crossing.y));
          const sampleLength = end - distance;
          const world = d.vec2u(worldPixel(pixel, params.worldSize, params.quadrant));
          const material = hrcMedium.$(world);
          let emission = d.vec3f(material.emission);
          if (hasSource) {
            emission += readFeedback(world.y * d.u32(params.worldSize.x) + world.x);
          }
          value = transport.over(
            value,
            transport.integrate(emission, material.extinction, sampleLength),
          );

          if (crossing.x <= end) {
            pixel.x += 1;
            crossing.x += crossingStep.x;
          }
          if (crossing.y <= end) {
            pixel.y += std.select(-1, 1, delta.y >= 0);
            crossing.y += crossingStep.y;
          }
          distance = end;
        }
      } else {
        const previousStep = std.intdiv(step, 2);
        const lower = std.intdiv(direction, 2);
        const offset = 2 * lower - previousStep;
        const near = loadInterval(x * 2, y, lower);
        value = transport.over(near, loadInterval(x * 2 + 1, y + offset, lower));

        if (direction < step) {
          const lowerPath = transport.over(near, loadInterval(x * 2 + 1, y + offset, lower + 1));
          const upperPath = transport.over(
            loadInterval(x * 2, y, lower + 1),
            loadInterval(x * 2 + 1, y + offset + 2, lower),
          );
          intervals.$.target[index + height] = transport.pack(
            transport.average(lowerPath, upperPath),
          );
        }
      }

      intervals.$.target[index] = transport.pack(value);
    });

  const gather = (final: boolean) =>
    tgpu.computeFn({
      workgroupSize: [64],
      in: { gid: d.builtin.globalInvocationId },
    })(({ gid }) => {
      'use gpu';
      const params = fluence.$.params;
      const id = gid.x + gid.y * params.rowSize;
      if (id >= params.count) return;

      const width = params.width;
      const height = params.height;
      const step = params.step;
      const upperColumns = ceilDiv(width, step * 2);

      const index32 = d.i32(id);
      const y = index32 % height;
      const direction = std.intdiv(index32, height) % step;
      const x = std.intdiv(index32, height * step);
      const even = x % 2 === 0;

      let result = d.vec3f();
      for (const half of tgpu.unroll([0, 1])) {
        const boundary = direction + half;
        const upperDirection = direction * 2 + half;
        const slope0 = d.f32(2 * upperDirection - step * 2) / d.f32(step * 2);
        const slope1 = d.f32(2 * (upperDirection + 1) - step * 2) / d.f32(step * 2);
        const angle = (std.atan(slope1) - std.atan(slope0)) / (2 * Math.PI);

        let segment = transport.empty();
        if (even) {
          segment = transport.unpack(
            fluence.$.far[(std.intdiv(x, 2) * (step * 2 + 1) + boundary * 2) * height + y]!,
          );
        } else {
          segment = transport.unpack(fluence.$.near[(x * (step + 1) + boundary) * height + y]!);
        }

        const targetY = y + (2 * boundary - step) * std.select(1, 2, even);
        const distant = readUpper(std.intdiv(x, 2) + 1, targetY, upperDirection, upperColumns);
        let contribution = segment.radiance * angle + segment.transmission * distant;
        if (even) {
          contribution =
            (contribution + readUpper(std.intdiv(x, 2), y, upperDirection, upperColumns)) * 0.5;
        }
        result += contribution;
      }

      if (final) {
        const pixel = d.vec2i(std.select(x - 1, width - 1, x === 0), y);
        // Preserve half precision rounding before the texture conversion
        const value = std.select(unpack(pack(d.vec4f(result, 0))), d.vec4f(), x === 0);
        std.textureStore(
          sectorTarget.$.sectors,
          worldPixel(pixel, params.worldSize, params.quadrant),
          params.quadrant,
          value,
        );
      } else {
        fluence.$.target[id] = pack(d.vec4f(result, 0));
      }
    });

  const sum = (p: d.v2i) => {
    'use gpu';
    let value = d.vec3f();
    for (const q of tgpu.unroll([0, 1, 2, 3])) {
      value += std.textureLoad(resolve.$.sectors, p, q, 0).rgb;
    }
    return value;
  };

  const integrate = tgpu.computeFn({
    workgroupSize: [64],
    in: { gid: d.builtin.globalInvocationId },
  })(({ gid }) => {
    'use gpu';
    const params = pixels.$.params;
    const id = gid.x + gid.y * params.rowSize;
    if (id >= params.count) return;
    const size = params.size;
    const pixel = d.vec2i(d.i32(id) % size.x, std.intdiv(d.i32(id), size.x));
    const opacity = std.exp(asRgb(hrcMedium.$(d.vec2u(pixel)).extinction) * -1);

    let value = sum(pixel) * 4;
    let weight = d.f32(4);
    for (const direction of tgpu.unroll([0, 1, 2, 3])) {
      const offset = d.vec2i(
        std.select(0, 1, direction === 0) - std.select(0, 1, direction === 2),
        std.select(0, 1, direction === 1) - std.select(0, 1, direction === 3),
      );
      const p = pixel + offset;
      if (std.all(std.ge(p, d.vec2i(0))) && std.all(std.lt(p, size))) {
        const neighborOpacity = std.exp(asRgb(hrcMedium.$(d.vec2u(p)).extinction) * -1);
        if (std.all(std.lt(std.abs(opacity - neighborOpacity), d.vec3f(0.1)))) {
          value += sum(p);
          weight += 1;
        }
      }
    }

    std.textureStore(resolve.$.output, pixel, d.vec4f(value / weight, 1));
    if (hasSource) feedback.$.feedback[id] = pack(d.vec4f(value / weight, 0));
  });

  const updateSource = (first: boolean) =>
    tgpu.computeFn({
      workgroupSize: [64],
      in: { gid: d.builtin.globalInvocationId },
    })(({ gid }) => {
      'use gpu';
      const params = pixels.$.params;
      const id = gid.x + gid.y * params.rowSize;
      if (id >= params.count) return;
      const width = d.u32(params.size.x);
      const pixel = d.vec2u(id % width, std.intdiv(id, width));
      const incident = first ? d.vec3f() : readFeedback(id);
      feedback.$.feedback[id] = pack(d.vec4f(source!(pixel, incident), 0));
    });

  const sampleMedium = tgpu.fn([d.vec2u], rgb ? MediumRgb : Medium)(medium);
  const configured = root.with(hrcMedium, sampleMedium);
  const pipeline = (compute: typeof integrate) => configured.createComputePipeline({ compute });

  return {
    rgb,
    hasSource,
    tracedLevels,
    layouts: { intervals, fluence, sectorTarget, pixels, resolve, feedback },
    schemas: { PassParams, PixelParams, Intervals, Fluence },
    pipelines: {
      extendTraced: pipeline(extend(true)),
      extendMerged: pipeline(extend(false)),
      gather: pipeline(gather(false)),
      gatherFinal: pipeline(gather(true)),
      integrate: pipeline(integrate),
      ...(hasSource && {
        sourceFirst: pipeline(updateSource(true)),
        sourceNext: pipeline(updateSource(false)),
      }),
    } as {
      readonly extendTraced: TgpuComputePipeline;
      readonly extendMerged: TgpuComputePipeline;
      readonly gather: TgpuComputePipeline;
      readonly gatherFinal: TgpuComputePipeline;
      readonly integrate: TgpuComputePipeline;
      /** Present when `source` is set */
      readonly sourceFirst?: TgpuComputePipeline;
      readonly sourceNext?: TgpuComputePipeline;
    },
  } as const;
}

/**
 * Pipelines, layouts and schemas of the holographic runner. Plain data, built by `define`.
 * `schemas.Intervals` and `schemas.Fluence` are runtime-sized array schemas.
 * @category Module
 */
export type HolographicDefinition = ReturnType<typeof define>;
