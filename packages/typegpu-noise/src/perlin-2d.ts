import tgpu, { type TgpuFn, type TgpuRoot } from 'typegpu';
import * as d from 'typegpu/data';
import { add, dot, floor, mix, mul, sub } from 'typegpu/std';
import { randOnUnitCircle, randSeed2 } from './random.ts';
import { smootherStep } from './utils.ts';

export interface Perlin2DCache {
  readonly getJunctionGradient: TgpuFn<[pos: d.Vec2i], d.Vec2f>;
  recompute(): void;
  destroy(): void;
}

export interface Perlin2DCacheOptions {
  readonly root: TgpuRoot;
  readonly size: [number, number];
}

export function createCache(options: Perlin2DCacheOptions): Perlin2DCache {
  const { root, size } = options;

  const memoryBuffer = root
    .createBuffer(d.arrayOf(d.vec2f, size[0] * size[1]))
    .$usage('storage');

  const memoryReadonly = memoryBuffer.as('readonly');
  const memoryMutable = memoryBuffer.as('mutable');

  const getJunctionGradient = tgpu['~unstable'].fn([d.vec2i], d.vec2f)(
    (pos) => {
      const x = (pos.x % size[0] + size[0]) % size[0];
      const y = (pos.y % size[1] + size[1]) % size[1];

      return memoryReadonly.value[x + y * size[0]] as d.v2f;
    },
  );

  const mainCompute = tgpu['~unstable'].computeFn({
    workgroupSize: [1, 1],
    in: { gid: d.builtin.globalInvocationId },
  })((input) => {
    memoryMutable.value[input.gid.x + input.gid.y * size[0]] =
      computeJunctionGradient(d.vec2i(input.gid.xy));
  });

  const computePipeline = root['~unstable']
    .withCompute(mainCompute)
    .createPipeline();

  const recompute = () => {
    computePipeline.dispatchWorkgroups(size[0], size[1]);
  };

  const destroy = () => {
    memoryBuffer.destroy();
  };

  return {
    getJunctionGradient,
    recompute,
    destroy,
  };
}

export const computeJunctionGradient = tgpu['~unstable'].fn([d.vec2i], d.vec2f)(
  (pos) => {
    randSeed2(mul(0.001, d.vec2f(pos)));
    return randOnUnitCircle();
  },
);

export const getJunctionGradientSlot = tgpu['~unstable'].slot(
  computeJunctionGradient,
);

const dotProdGrid = tgpu['~unstable'].fn([d.vec2f, d.vec2i], d.f32)(
  (pos, junction) => {
    const relative = sub(pos, d.vec2f(junction));
    const gridVector = getJunctionGradientSlot.value(junction);
    return dot(relative, gridVector);
  },
);

export const sample = tgpu['~unstable'].fn([d.vec2f], d.f32)((pos) => {
  const topLeftJunction = d.vec2i(floor(pos));

  const topLeft = dotProdGrid(pos, topLeftJunction);
  const topRight = dotProdGrid(pos, add(topLeftJunction, d.vec2i(1, 0)));
  const bottomLeft = dotProdGrid(pos, add(topLeftJunction, d.vec2i(0, 1)));
  const bottomRight = dotProdGrid(pos, add(topLeftJunction, d.vec2i(1, 1)));

  const partial = sub(pos, floor(pos));
  const top = mix(topLeft, topRight, smootherStep(partial.x));
  const bottom = mix(bottomLeft, bottomRight, smootherStep(partial.x));
  return mix(top, bottom, smootherStep(partial.y));
});
