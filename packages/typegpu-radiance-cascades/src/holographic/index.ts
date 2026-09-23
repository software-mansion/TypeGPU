/* oxlint-disable typescript-eslint/no-non-null-assertion -- Indices are bounded by the cascade lattice */
import {
  d,
  std,
  tgpu,
  type SampledFlag,
  type StorageFlag,
  type TgpuRoot,
  type TgpuCommandEncoder,
  type TgpuComputePass,
  type TgpuComputePipeline,
  type TgpuBindGroup,
  type TgpuTexture,
} from 'typegpu';
import { getLayout } from './layout.ts';
import { asRgb, createTransport } from './transport.ts';

const Medium = d.struct({ emission: d.vec3f, extinction: d.f32 });
const MediumRgb = d.struct({ emission: d.vec3f, extinction: d.vec3f });
type Material = { emission: d.v3f; extinction: number | d.v3f };
const hrcMedium = tgpu.slot<(pixel: d.v2u) => Material>();

const unpack = (v: d.v2u) => {
  'use gpu';
  return d.vec4f(std.unpack2x16float(v.x), std.unpack2x16float(v.y));
};

const pack = (v: d.v4f) => {
  'use gpu';
  return d.vec2u(std.pack2x16float(v.xy), std.pack2x16float(v.zw));
};

function getDispatchSize(count: number) {
  const rows = Math.ceil(count / (65535 * 64));
  return [Math.ceil(count / (64 * rows)), rows] as const;
}

const withBindGroups = (pipeline: TgpuComputePipeline, groups: readonly TgpuBindGroup[]) =>
  groups.reduce((bound, group) => bound.with(group), pipeline);

type CommonOptions = {
  root: TgpuRoot;
  size: { width: number; height: number };
  /** Additional emission, evaluated once per pixel before each solve */
  source?: (pixel: d.v2u, incident: d.v3f) => d.v3f;
  /** Directly integrated levels before interval extension. Default: 3 */
  tracedLevels?: number;
};

type Options = CommonOptions &
  (
    | { transmission?: 'scalar'; medium: (pixel: d.v2u) => { emission: d.v3f; extinction: number } }
    | { transmission: 'rgb'; medium: (pixel: d.v2u) => { emission: d.v3f; extinction: d.v3f } }
  );

type RunOptions = {
  /** Each run starts from zero incident light. Default: 1 */
  iterations?: number;
  encoder?: TgpuCommandEncoder | GPUCommandEncoder;
  pass?: TgpuComputePass | GPUComputePassEncoder;
};

type OutputTexture = TgpuTexture<{ size: [number, number]; format: 'rgba16float' }> &
  StorageFlag &
  SampledFlag;
type SectorTexture = TgpuTexture<{ size: [number, number, number]; format: 'rgba16float' }> &
  StorageFlag &
  SampledFlag;

export type Executor = {
  /**
   * Records the solve into one compute pass. A supplied encoder is not submitted and a
   * supplied pass is not ended; with neither, the work is submitted on its own.
   */
  run(options?: RunOptions): void;
  /** Returns an executor with an extra bind group attached to all internal passes */
  with(bindGroup: TgpuBindGroup): Executor;
  /** Angular mean radiance, normalized by 2π */
  readonly output: OutputTexture;
  /** Radiance from the +X, +Y, −X and −Y sectors, one layer each */
  readonly sectors: SectorTexture;
  /** Logical size of the allocations owned by the executor */
  readonly byteSize: number;
  /** Releases the output textures and intermediate buffers */
  destroy(): void;
  /**
   * Eagerly initializes every pipeline by calling `initSync` on each.
   * Calling this is optional.
   */
  initSync(): void;
  /**
   * Eagerly initializes every pipeline by calling `initAsync` on each.
   * Calling this is optional.
   */
  initAsync(): Promise<void>;
};

/** Four-sector HRC, using the interval and fluence recurrences of Freeman et al. (2025). */
export function create(options: Options): Executor {
  const { root, medium, source } = options;
  const size = [options.size.width, options.size.height] as const;
  const rgb = options.transmission === 'rgb';
  const hasSource = source !== undefined;
  const tracedLevels = options.tracedLevels ?? 3;

  const transport = createTransport(rgb);
  const intervals = tgpu.bindGroupLayout({
    source: { storage: d.arrayOf(transport.Packed) },
    target: { storage: d.arrayOf(transport.Packed), access: 'mutable' },
  });
  const fluence = tgpu.bindGroupLayout({
    near: { storage: d.arrayOf(transport.Packed) },
    far: { storage: d.arrayOf(transport.Packed) },
    upper: { storage: d.arrayOf(d.vec2u) },
    target: { storage: d.arrayOf(d.vec2u), access: 'mutable' },
  });

  const info = getLayout(size);
  const pyramid = info.intervalCounts.map((count) =>
    root.createBuffer(d.arrayOf(transport.Packed, count)).$usage('storage'),
  );
  const radiance = [0, 1].map(() =>
    root.createBuffer(d.arrayOf(d.vec2u, info.fluenceCount)).$usage('storage'),
  );
  const sectors = root
    .createTexture({ size: [size[0], size[1], 4], format: 'rgba16float' })
    .$usage('storage', 'sampled');
  const sectorRead = sectors.createView(d.texture2dArray(d.f32));
  const sectorWrite = sectors.createView(d.textureStorage2dArray('rgba16float'));
  const output = root
    .createTexture({ size: [size[0], size[1]], format: 'rgba16float' })
    .$usage('storage', 'sampled');
  const outputWrite = output.createView(d.textureStorage2d('rgba16float'));
  const feedback = source ? root.createMutable(d.arrayOf(d.vec2u, size[0] * size[1])) : undefined;

  const sampleMedium = tgpu.fn([d.vec2u], rgb ? MediumRgb : Medium)(medium);
  const configured = root.with(hrcMedium, sampleMedium);
  const passes: { pipeline: TgpuComputePipeline; dispatchSize: readonly [number, number] }[] = [];
  const pipelines = new Map<string, TgpuComputePipeline>();

  for (let quadrant = 0; quadrant < 4; quadrant++) {
    const width = size[quadrant % 2]!;
    const height = size[1 - (quadrant % 2)]!;
    const levels = Math.ceil(Math.log2(width));

    const worldPixel = (p: d.v2i) => {
      'use gpu';
      if (quadrant === 0) return d.vec2i(p);
      if (quadrant === 1) return d.vec2i(size[0] - 1 - p.y, p.x);
      if (quadrant === 2) return d.vec2i(size[0] - 1 - p.x, size[1] - 1 - p.y);
      return d.vec2i(p.y, size[1] - 1 - p.x);
    };

    for (let level = 0; level <= levels; level++) {
      const step = 2 ** level;
      const columns = Math.ceil(width / step);
      const paired = level >= tracedLevels;
      const directions = paired ? step / 2 + 1 : step + 1;
      const count = columns * height * directions;
      const dispatchSize = getDispatchSize(count);
      const rowSize = dispatchSize[0] * 64;

      const previousStep = step / 2;
      const previousColumns = Math.ceil(width / previousStep);
      const previousDirections = step / 2 + 1;

      const load = (x: number, y: number, direction: number) => {
        'use gpu';
        if (x < 0 || x >= previousColumns || y < 0 || y >= height) return transport.empty();
        return transport.unpack(
          intervals.$.source[(x * previousDirections + direction) * height + y]!,
        );
      };

      const compute = tgpu.computeFn({
        workgroupSize: [64],
        in: { gid: d.builtin.globalInvocationId },
      })(({ gid }) => {
        'use gpu';
        const id = gid.x + gid.y * rowSize;
        if (id >= count) return;
        const y = d.i32(id % height);
        const direction = d.i32(std.intdiv(id, height) % directions) * (paired ? 2 : 1);
        const x = d.i32(std.intdiv(id, height * directions));
        const index = (x * (step + 1) + direction) * height + y;

        let value = transport.empty();
        if (level < tracedLevels) {
          const delta = d.vec2f(step, 2 * direction - step);
          const length = std.length(delta);
          const crossingStep = length / std.max(std.abs(delta), d.vec2f(0.00001));
          let crossing = crossingStep * 0.5;
          let pixel = d.vec2i(x * step, y);
          let distance = d.f32(0);

          for (let sample = d.u32(0); sample < step * 2 + 1; sample++) {
            if (pixel.x >= width || pixel.y < 0 || pixel.y >= height || distance >= length) break;
            const end = std.min(length, std.min(crossing.x, crossing.y));
            const sampleLength = end - distance;
            const world = d.vec2u(worldPixel(pixel));
            const material = hrcMedium.$(world);
            let emission = d.vec3f(material.emission);
            if (hasSource) emission += unpack(feedback!.$[world.y * size[0] + world.x]!).rgb;
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
          const lower = std.intdiv(direction, 2);
          const offset = 2 * lower - previousStep;
          const near = load(x * 2, y, lower);
          value = transport.over(near, load(x * 2 + 1, y + offset, lower));

          if (direction < step) {
            const lowerPath = transport.over(near, load(x * 2 + 1, y + offset, lower + 1));
            const upperPath = transport.over(
              load(x * 2, y, lower + 1),
              load(x * 2 + 1, y + offset + 2, lower),
            );
            intervals.$.target[index + height] = transport.pack(
              transport.average(lowerPath, upperPath),
            );
          }
        }

        intervals.$.target[index] = transport.pack(value);
      });

      const bindGroup = root.createBindGroup(intervals, {
        source: pyramid[level === 0 ? 1 : level - 1]!,
        target: pyramid[level]!,
      });
      const key = `up_${width}x${height}_l${level}${level < tracedLevels ? `_q${quadrant}` : ''}`;
      let pipeline = pipelines.get(key);
      if (!pipeline) {
        pipeline = configured.createComputePipeline({ compute });
        pipelines.set(key, pipeline);
      }
      passes.push({ pipeline: pipeline.with(bindGroup), dispatchSize });
    }

    for (let level = levels - 1; level >= 0; level--) {
      const step = 2 ** level;
      const columns = Math.ceil(width / step);
      const upperColumns = Math.ceil(width / (step * 2));
      const count = columns * height * step;
      const dispatchSize = getDispatchSize(count);
      const rowSize = dispatchSize[0] * 64;

      const readUpper = (x: number, y: number, direction: number) => {
        'use gpu';
        if (level === levels - 1) return d.vec3f();
        if (x >= upperColumns || y < 0 || y >= height) return d.vec3f();
        return unpack(fluence.$.upper[(x * step * 2 + direction) * height + y]!).rgb;
      };

      const compute = tgpu.computeFn({
        workgroupSize: [64],
        in: { gid: d.builtin.globalInvocationId },
      })(({ gid }) => {
        'use gpu';
        const id = gid.x + gid.y * rowSize;
        if (id >= count) return;
        const y = d.i32(id % height);
        const direction = d.i32(std.intdiv(id, height) % step);
        const x = d.i32(std.intdiv(id, height * step));
        const even = x % 2 === 0;

        let result = d.vec3f();
        for (const half of tgpu.unroll([0, 1])) {
          const boundary = direction + half;
          const upperDirection = direction * 2 + half;
          const slope0 = (2 * upperDirection - step * 2) / (step * 2);
          const slope1 = (2 * (upperDirection + 1) - step * 2) / (step * 2);
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
          const distant = readUpper(std.intdiv(x, 2) + 1, targetY, upperDirection);
          let contribution = segment.radiance * angle + segment.transmission * distant;
          if (even) {
            contribution = (contribution + readUpper(std.intdiv(x, 2), y, upperDirection)) * 0.5;
          }
          result += contribution;
        }

        if (level === 0) {
          const pixel = d.vec2i(std.select(x - 1, width - 1, x === 0), y);
          // Preserve half precision rounding before the texture conversion
          const value = std.select(unpack(pack(d.vec4f(result, 0))), d.vec4f(), x === 0);
          std.textureStore(sectorWrite.$, worldPixel(pixel), quadrant, value);
        } else {
          fluence.$.target[id] = pack(d.vec4f(result, 0));
        }
      });

      const bindGroup = root.createBindGroup(fluence, {
        near: pyramid[level]!,
        far: pyramid[level + 1]!,
        upper: radiance[1 - (level % 2)]!,
        target: radiance[level % 2]!,
      });
      const key = `down_${width}x${height}_l${level}${level === 0 ? `_q${quadrant}` : ''}`;
      let pipeline = pipelines.get(key);
      if (!pipeline) {
        pipeline = configured.createComputePipeline({ compute });
        pipelines.set(key, pipeline);
      }
      passes.push({ pipeline: pipeline.with(bindGroup), dispatchSize });
    }
  }

  const pixelCount = size[0] * size[1];
  const pixelDispatch = getDispatchSize(pixelCount);
  const rowSize = pixelDispatch[0] * 64;

  const sum = (p: d.v2i) => {
    'use gpu';
    let value = d.vec3f();
    for (const q of tgpu.unroll([0, 1, 2, 3])) value += std.textureLoad(sectorRead.$, p, q, 0).rgb;
    return value;
  };

  const integrate = tgpu.computeFn({
    workgroupSize: [64],
    in: { gid: d.builtin.globalInvocationId },
  })(({ gid }) => {
    'use gpu';
    const id = gid.x + gid.y * rowSize;
    if (id >= pixelCount) return;
    const pixel = d.vec2i(id % size[0], std.intdiv(id, size[0]));
    const opacity = std.exp(asRgb(hrcMedium.$(d.vec2u(pixel)).extinction) * -1);

    let value = sum(pixel) * 4;
    let weight = d.f32(4);
    for (const direction of tgpu.unroll([0, 1, 2, 3])) {
      const offset = d.vec2i(
        std.select(0, 1, direction === 0) - std.select(0, 1, direction === 2),
        std.select(0, 1, direction === 1) - std.select(0, 1, direction === 3),
      );
      const p = pixel + offset;
      if (std.all(std.ge(p, d.vec2i(0))) && std.all(std.lt(p, d.vec2i(size[0], size[1])))) {
        const neighborOpacity = std.exp(asRgb(hrcMedium.$(d.vec2u(p)).extinction) * -1);
        if (std.all(std.lt(std.abs(opacity - neighborOpacity), d.vec3f(0.1)))) {
          value += sum(p);
          weight += 1;
        }
      }
    }

    std.textureStore(outputWrite.$, pixel, d.vec4f(value / weight, 1));
    if (hasSource) feedback!.$[id] = pack(d.vec4f(value / weight, 0));
  });

  passes.push({
    pipeline: configured.createComputePipeline({ compute: integrate }),
    dispatchSize: pixelDispatch,
  });

  const sources = source
    ? [true, false].map((first) => {
        const updateSource = tgpu.computeFn({
          workgroupSize: [64],
          in: { gid: d.builtin.globalInvocationId },
        })(({ gid }) => {
          'use gpu';
          const id = gid.x + gid.y * rowSize;
          if (id >= pixelCount) return;
          const pixel = d.vec2u(id % size[0], std.intdiv(id, size[0]));
          const incident = first ? d.vec3f() : unpack(feedback!.$[id]!).rgb;
          feedback!.$[id] = pack(d.vec4f(source(pixel, incident), 0));
        });
        return configured.createComputePipeline({ compute: updateSource });
      })
    : [];

  const byteSize =
    info.bytes +
    (rgb ? info.intervalCounts.reduce((total, count) => total + count * 4, 0) : 0) +
    (feedback ? pixelCount * 8 : 0);

  function destroy() {
    for (const buffer of [...pyramid, ...radiance]) buffer.destroy();
    feedback?.buffer.destroy();
    sectors.destroy();
    output.destroy();
  }

  function createExecutor(bindGroups: readonly TgpuBindGroup[]): Executor {
    const bound = passes.map(({ pipeline, dispatchSize }) => ({
      pipeline: withBindGroups(pipeline, bindGroups),
      dispatchSize,
    }));
    const boundSources = sources.map((pipeline) => withBindGroups(pipeline, bindGroups));
    const pipelines = [...bound.map(({ pipeline }) => pipeline), ...boundSources];

    return {
      output,
      sectors,
      byteSize,
      run({ encoder, pass, iterations = 1 } = {}) {
        const commands = encoder ?? (pass ? undefined : root['~unstable'].createCommandEncoder());
        const computePass = (pass ?? commands!.beginComputePass()) as TgpuComputePass;

        for (let iteration = 0; iteration < iterations; iteration++) {
          boundSources[iteration === 0 ? 0 : 1]
            ?.with(computePass)
            .dispatchWorkgroups(...pixelDispatch);
          for (const { pipeline, dispatchSize } of bound) {
            pipeline.with(computePass).dispatchWorkgroups(...dispatchSize);
          }
        }

        if (!pass) computePass.end();
        if (!pass && !encoder) (commands as TgpuCommandEncoder).submit();
      },
      with: (bindGroup) => createExecutor([...bindGroups, bindGroup]),
      destroy,
      initSync: () => pipelines.forEach((pipeline) => pipeline.initSync()),
      initAsync: () =>
        Promise.all(pipelines.map((pipeline) => pipeline.initAsync())).then(() => {}),
    };
  }

  return createExecutor([]);
}
