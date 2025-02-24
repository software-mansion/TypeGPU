import { Bench } from 'tinybench';
import { createSuite } from '../suites';
import { stringifyLocator, type BenchParameterSet } from '../parameter-set';
import type { TypeGPUDataModule, TypeGPUModule } from '../modules';

export const dummySuite = createSuite(
  (
    params: BenchParameterSet,
    { tgpu }: TypeGPUModule,
    dArg: TypeGPUDataModule,
  ) => {
    const bench = new Bench({
      name: stringifyLocator('typegpu', params.typegpu),
      time: 1000,
    });

    return {
      bench,
      foo: 5,
    };
  },
  {
    dummy: (getCtx) => async () => {
      const { foo } = getCtx();
      await new Promise((resolve) => setTimeout(resolve, foo));
    },
  },
);
