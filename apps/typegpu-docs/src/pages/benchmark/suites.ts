import type { Bench } from 'tinybench';
import { partialWriteSuite } from './test_suites/partial-write';
import type { TypeGPUDataModule, TypeGPUModule } from './modules';
import type { BenchParameterSet } from './parameter-set';
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

export type SuiteSetupOptions = {
  params: BenchParameterSet;
  tgpuModule: TypeGPUModule;
  d: TypeGPUDataModule;
};

// biome-ignore lint/suspicious/noExplicitAny: <sshhhhhh...>
export type Suite<T extends { bench: Bench } = any> = {
  setup(options: SuiteSetupOptions): T;
  tests: Record<string, (getCtx: () => T) => () => Promise<unknown>>;
};

export function createSuite<T extends { bench: Bench }>(
  setup: (options: SuiteSetupOptions) => T,
  tests: Record<string, (getCtx: () => T) => () => Promise<unknown>>,
): Suite<T> {
  return { setup, tests };
}

export const unfilteredSuites: Record<string, Suite> = {
  'Partial write': partialWriteSuite,
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
