import { Bench } from 'tinybench';
import type { TgpuBuffer, TgpuRoot } from 'typegpu';
import { stringifyLocator } from '../parameter-set.ts';
import { createSuite } from '../suites.ts';

export const partialWriteSuite = createSuite(
  ({ params, tgpuModule, d }) => {
    const { tgpu } = tgpuModule;
    const amountOfBoids = 10000;

    const Boid = d.struct({
      pos: d.vec3f,
      vel: d.vec3f,
    });

    const BoidArray = d.arrayOf(Boid, amountOfBoids);

    const ctx = {
      bench: null as unknown as Bench,
      amountOfBoids,
      d,
      root: null as unknown as TgpuRoot,
      buffer: null as unknown as TgpuBuffer<typeof BoidArray>,
    };

    ctx.bench = new Bench({
      name: stringifyLocator('typegpu', params.typegpu),
      time: 1000,
      async setup() {
        ctx.root = await tgpu.init();
        ctx.buffer = ctx.root.createBuffer(BoidArray);
      },
      teardown() {
        ctx.root.destroy();
      },
    });

    return ctx;
  },
  {
    'non-partial WebGPU reference': (getCtx) => async () => {
      const { amountOfBoids, d, root, buffer } = getCtx();

      const Boid = d.struct({
        pos: d.vec3f,
        vel: d.vec3f,
      });
      const BoidArray = d.arrayOf(Boid, amountOfBoids);
      const data = new ArrayBuffer(d.sizeOf(BoidArray));
      const fView = new Float32Array(data);

      for (let i = 0; i < amountOfBoids; ++i) {
        fView[i * 8 + 0] = 1;
        fView[i * 8 + 1] = 2;
        fView[i * 8 + 2] = 3;

        fView[i * 8 + 4] = 4;
        fView[i * 8 + 5] = 5;
        fView[i * 8 + 6] = 6;
      }

      root.device.queue.writeBuffer(root.unwrap(buffer), 0, data);
      await root.device.queue.onSubmittedWorkDone();
    },

    'non-partial TGPU reference': (getCtx) => async () => {
      const { amountOfBoids, d, root, buffer } = getCtx();

      buffer.write(
        Array.from({ length: amountOfBoids }).map(() => ({
          pos: d.vec3f(1, 2, 3),
          vel: d.vec3f(4, 5, 6),
        })),
      );
      await root.device.queue.onSubmittedWorkDone();
    },

    'one struct write': (getCtx) => async () => {
      const { amountOfBoids, d, root, buffer } = getCtx();

      const randomBoid = Math.floor(Math.random() * amountOfBoids);

      buffer.writePartial([
        {
          idx: randomBoid,
          value: { pos: d.vec3f(1, 2, 3), vel: d.vec3f(4, 5, 6) },
        },
      ]);

      await root.device.queue.onSubmittedWorkDone();
    },

    '20% of the buffer - not contiguous': (getCtx) => async () => {
      const { amountOfBoids, d, root, buffer } = getCtx();

      const writes = Array.from({ length: amountOfBoids })
        .map((_, i) => i)
        .filter((_, i) => i % 5 === 0)
        .map((i) => ({
          idx: i,
          value: { pos: d.vec3f(1, 2, 3), vel: d.vec3f(4, 5, 6) },
        }));

      buffer.writePartial(writes);

      await root.device.queue.onSubmittedWorkDone();
    },

    '20% of the buffer - contiguous': (getCtx) => async () => {
      const { amountOfBoids, d, root, buffer } = getCtx();

      const writes = Array.from({ length: amountOfBoids / 5 })
        .map((_, i) => i)
        .map((i) => ({
          idx: i,
          value: { pos: d.vec3f(1, 2, 3), vel: d.vec3f(4, 5, 6) },
        }));

      buffer.writePartial(writes);
      await root.device.queue.onSubmittedWorkDone();
    },

    '100% of the buffer - contiguous': (getCtx) => async () => {
      const { amountOfBoids, d, root, buffer } = getCtx();

      const writes = Array.from({ length: amountOfBoids })
        .map((_, i) => i)
        .map((i) => ({
          idx: i,
          value: { pos: d.vec3f(1, 2, 3), vel: d.vec3f(4, 5, 6) },
        }));

      buffer.writePartial(writes);
      await root.device.queue.onSubmittedWorkDone();
    },
  },
);
