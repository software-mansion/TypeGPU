import type { Bench } from 'tinybench';
import { massTransferSuite } from './test_suites/mass-transfer';
import type { TypeGPUDataModule, TypeGPUModule } from './modules';
import type { BenchParameterSet } from './parameter-set';
import { dummySuite } from './test_suites/dummy';
import { atomWithUrl } from './atom-with-url';

export type TestIdentifier = `${string}_${string}`;

export function identifierOf(
  suiteName: string,
  testName: string,
): TestIdentifier {
  return `${suiteName.replaceAll(' ', '-')}_${testName.replaceAll(' ', '-')}`;
}

export const selectedTestsAtom = atomWithUrl<TestIdentifier[]>('t', []);

export type Suite = () => {
  suiteSetup(
    params: BenchParameterSet,
    { tgpu }: TypeGPUModule,
    dArg: TypeGPUDataModule,
  ): Bench;
  tests: Record<string, () => void>;
};

export const suites: Record<string, Suite> = {
  Dummy: dummySuite,
  'Mass transfer': massTransferSuite,
};
