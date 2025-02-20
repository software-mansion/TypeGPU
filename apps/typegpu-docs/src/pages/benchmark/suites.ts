import type { Bench } from 'tinybench';
import { massTransferSuite } from './test_suites/mass-transfer';
import type { TypeGPUDataModule, TypeGPUModule } from './modules';
import type { BenchParameterSet } from './parameter-set';
import { dummySuite } from './test_suites/dummy';

export type Suite = () => {
  suiteSetup(
    params: BenchParameterSet,
    { tgpu }: TypeGPUModule,
    dArg: TypeGPUDataModule,
  ): Bench;
  tests: Record<string, () => void>;
};

export const suites: { name: string; generator: Suite }[] = [
  {
    name: 'Dummy',
    generator: dummySuite,
  },
  {
    name: 'Mass transfer',
    generator: massTransferSuite,
  },
];
