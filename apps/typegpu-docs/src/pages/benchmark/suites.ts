import type { Bench } from 'tinybench';
import { massTransferSuite } from './test_suites/mass-transfer';
import type { TypeGPUDataModule, TypeGPUModule } from './modules';
import type { BenchParameterSet } from './parameter-set';
import { dummySuite } from './test_suites/dummy';
import { atomWithUrl } from './atom-with-url';

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

export type TestIdentifier = `${string}_${string}`;

export function testIdentifierOf(
  suiteName: string,
  testName: string,
): TestIdentifier {
  return `${suiteName.replaceAll(' ', '-')}_${testName.replaceAll(' ', '-')}`;
}

export function namesFromIdentifier(identifier: TestIdentifier): {
  suiteName: string;
  testName: string;
} {
  const split = identifier.split('_');
  if (split.length !== 2) {
    throw new Error(`Invalid test identifier ${identifier}.`);
  }
  return {
    suiteName: split[0].replaceAll('-', ' '),
    testName: split[1].replaceAll('-', ' '),
  };
}

export function testIdentifiers(): Set<TestIdentifier> {
  const result = new Set<TestIdentifier>();
  for (const suiteName in suites) {
    const suite = suites[suiteName]();
    for (const testName in suite) {
      result.add(testIdentifierOf(suiteName, testName));
    }
  }
  return result;
}

export const selectedTestsAtom = atomWithUrl<TestIdentifier[]>('t', []);
