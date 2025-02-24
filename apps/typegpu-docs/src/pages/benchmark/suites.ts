import type { Bench } from 'tinybench';
import { massTransferSuite } from './test_suites/mass-transfer';
import type { TypeGPUDataModule, TypeGPUModule } from './modules';
import type { BenchParameterSet } from './parameter-set';
import { dummySuite } from './test_suites/dummy';
import { atomWithUrl } from './atom-with-url';
import { entries, filter, fromEntries, map, pipe } from 'remeda';

export type TestIdentifier = `${string}_${string}`;

export function identifierOf(
  suiteName: string,
  testName: string,
): TestIdentifier {
  return `${suiteName.replaceAll(' ', '-')}_${testName.replaceAll(' ', '-')}`;
}

export const selectedTestsAtom = atomWithUrl<TestIdentifier[]>('t', []);

// biome-ignore lint/suspicious/noExplicitAny: <sshhhhhh...>
export type Suite<T extends { bench: Bench } = any> = {
  setup(
    params: BenchParameterSet,
    { tgpu }: TypeGPUModule,
    dArg: TypeGPUDataModule,
  ): T;
  tests: Record<string, (getCtx: () => T) => () => Promise<unknown>>;
};

export function createSuite<T extends { bench: Bench }>(
  setup: (
    params: BenchParameterSet,
    { tgpu }: TypeGPUModule,
    dArg: TypeGPUDataModule,
  ) => T,
  tests: Record<string, (getCtx: () => T) => () => Promise<unknown>>,
): Suite<T> {
  return {
    setup,
    tests,
  };
}

export const unfilteredSuites: Record<string, Suite> = {
  Dummy: dummySuite,
  'Mass transfer': massTransferSuite,
};

export function getFilteredSuites(selectedTests: TestIdentifier[]) {
  return pipe(
    unfilteredSuites,
    entries(),
    // filter the suite to retain only selected tests
    map((entry) => {
      const [suiteName, suite] = entry;
      const { setup, tests } = suite;

      // remove tests that were not selected
      const filteredTests = pipe(
        tests,
        entries(),
        filter((entry) =>
          selectedTests.includes(identifierOf(suiteName, entry[0])),
        ),
        fromEntries(),
      );

      entry[1] = { setup, tests: filteredTests };
      return entry;
    }),
    // filter the suites to retain only non-empty suites
    filter((entry) => Object.keys(entry[1]).length > 0),
    fromEntries(),
  );
}
