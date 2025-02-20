import { Bench } from 'tinybench';
import type { TypeGPUDataModule, TypeGPUModule } from '../modules';
import { stringifyLocator, type BenchParameterSet } from '../parameter-set';
import type { TgpuBuffer, TgpuRoot } from 'typegpu';
import type { WgslArray, WgslStruct, Vec3f } from 'typegpu/data';
import type { Suite } from '../suites';

export const massTransferSuite: Suite = () => {
  // suite setup
  let bench: Bench;
  let d: TypeGPUDataModule;
  // test setup
  const amountOfBoids = 10000;
  let root: TgpuRoot;
  let buffer: TgpuBuffer<WgslArray<WgslStruct<{ pos: Vec3f; vel: Vec3f }>>>;

  const suiteSetup = (
    params: BenchParameterSet,
    { tgpu }: TypeGPUModule,
    dArg: TypeGPUDataModule,
  ) => {
    bench = new Bench({
      name: stringifyLocator('typegpu', params.typegpu),
      time: 1000,
      async setup() {
        root = await tgpu.init();
        const Boid = d.struct({
          pos: d.vec3f,
          vel: d.vec3f,
        });
        const BoidArray = d.arrayOf(Boid, amountOfBoids);
        buffer = root.createBuffer(BoidArray);
      },
      teardown() {
        root.destroy();
      },
    });
    d = dArg;
    return bench;
  };

  const tests: Record<string, () => void> = {
    default: () => {
      buffer.write(
        Array.from({ length: amountOfBoids }).map(() => ({
          pos: d.vec3f(1, 2, 3),
          vel: d.vec3f(4, 5, 6),
        })),
      );
    },
    'manual reference': () => {
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
  };

  return { suiteSetup, tests };
};
