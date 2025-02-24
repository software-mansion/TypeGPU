import { Bench } from 'tinybench';
import type { TypeGPUDataModule, TypeGPUModule } from '../modules';
import { stringifyLocator, type BenchParameterSet } from '../parameter-set';
import type { TgpuBuffer, TgpuRoot } from 'typegpu';
import { createSuite } from '../suites';

export const massTransferSuite = createSuite(
  (
    // AAA wyjąć to do jakiegoś obiektu Options
    params: BenchParameterSet,
    { tgpu }: TypeGPUModule,
    d: TypeGPUDataModule,
  ) => {
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

    // test setup
    let root: TgpuRoot;

    ctx.bench = new Bench({
      name: stringifyLocator('typegpu', params.typegpu),
      time: 1000,
      async setup() {
        root = await tgpu.init();

        ctx.buffer = root.createBuffer(BoidArray);
      },
      teardown() {
        root.destroy();
      },
    });

    return ctx;
  },
  {
    default:
      ({ amountOfBoids, d, root, buffer }) =>
      async () => {
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
