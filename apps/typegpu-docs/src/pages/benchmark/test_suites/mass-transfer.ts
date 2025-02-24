import { Bench } from 'tinybench';
import { stringifyLocator } from '../parameter-set';
import type { TgpuBuffer, TgpuRoot } from 'typegpu';
import { createSuite } from '../suites';

export const massTransferSuite = createSuite(
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
    default: (getCtx) => async () => {
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
    },
  },
);
