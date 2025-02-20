import { Bench } from 'tinybench';
import type { TypeGPUDataModule, TypeGPUModule } from '../modules';
import { stringifyLocator, type BenchParameterSet } from '../parameter-set';
import type { Suite } from '../suites';

export const dummySuite: Suite = () => {
  // suite setup
  let bench: Bench;

  const suiteSetup = (
    params: BenchParameterSet,
    { tgpu }: TypeGPUModule,
    dArg: TypeGPUDataModule,
  ) => {
    bench = new Bench({
      name: stringifyLocator('typegpu', params.typegpu),
      time: 1000,
    });
    return bench;
  };

  const tests: Record<string, () => void> = {
    dummy: async () => {
      await new Promise((resolve) => setTimeout(resolve, 1));
    },
  };

  return { suiteSetup, tests };
};
