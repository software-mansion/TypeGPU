import { useAtomValue, useSetAtom } from 'jotai/react';
import { atom } from 'jotai/vanilla';
import { CirclePlus } from 'lucide-react';
import { Suspense } from 'react';
import type { Bench } from 'tinybench';
import {
  BenchmarkFallback,
  BenchmarkResults,
} from './components/benchmark-results.tsx';
import { SuiteCheckbox } from './components/checkbox-tree.tsx';
import { ParameterSetRow } from './components/parameter-set-row.tsx';
import { importTypeGPU, importTypeGPUData } from './modules.ts';
import {
  type BenchParameterSet,
  createParameterSetAtom,
  parameterSetAtomsAtom,
  parameterSetsAtom,
} from './parameter-set.ts';
import {
  getFilteredSuites,
  selectedTestsAtom,
  type Suite,
  unfilteredSuites,
} from './suites.ts';

export interface InstanceResults {
  parameterSet: BenchParameterSet;
  benches: Bench[];
}

async function runSuitesForTgpu(
  params: BenchParameterSet,
  filteredSuites: Record<string, Suite>,
): Promise<InstanceResults> {
  const tgpu = await importTypeGPU(params.typegpu);
  const d = await importTypeGPUData(params.typegpu);
  const results = [];

  for (const [suiteName, suite] of Object.entries(filteredSuites)) {
    const ctx = suite.setup({ params, tgpuModule: tgpu, d });
    for (const testName in suite.tests) {
      ctx.bench.add(
        `${suiteName}: ${testName}`,
        suite.tests[testName](() => ctx),
      );
    }
    await ctx.bench.run();
    results.push(ctx.bench);
  }
  return { parameterSet: params, benches: results };
}

export const benchResultsAtom = atom<Promise<InstanceResults[]> | null>(null);

const runBenchmarksAtom = atom(null, async (get, set) => {
  const parameterSets = get(parameterSetsAtom);
  const selectedTests = get(selectedTestsAtom);
  const filteredSuites = getFilteredSuites(selectedTests);

  set(
    benchResultsAtom,
    (async () => {
      const results: InstanceResults[] = [];

      // for each instance of tgpu, we run all selected tests
      for (const params of parameterSets) {
        results.push(await runSuitesForTgpu(params, filteredSuites));
      }

      return results;
    })(),
  );
});

export default function BenchmarkApp() {
  const parameterSetAtoms = useAtomValue(parameterSetAtomsAtom);
  const runBenchmarks = useSetAtom(runBenchmarksAtom);
  const createParameterSet = useSetAtom(createParameterSetAtom);

  return (
    <div className='px-4'>
      <div className='mx-auto my-10 flex w-96 flex-col items-center justify-between gap-4 rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800'>
        <div>
          <p className='mb-2 w-full text-lg'>Versions to compare:</p>
          <ul className='m-0 my-1 flex w-full list-none flex-col items-start gap-1 p-0'>
            {parameterSetAtoms.map((paramsAtom, index) => (
              <li
                key={`${index}`}
                className='w-full'
              >
                <ParameterSetRow parameterSetAtom={paramsAtom} />
              </li>
            ))}
          </ul>
          <div className='w-full'>
            <button
              type='button'
              className='me-2 flex h-10 w-10 cursor-pointer select-none items-center justify-center rounded-md bg-transparent p-2 text-center text-sm text-white transition-colors hover:bg-gray-700'
              onClick={createParameterSet}
            >
              <CirclePlus />
            </button>
          </div>
        </div>
        <div className='w-full'>
          <p className='mb-2 text-lg'>Benchmark suites to run:</p>
          <div className='w-full'>
            {Object.entries(unfilteredSuites).map(([suiteName, suite]) => (
              <SuiteCheckbox
                suiteName={suiteName}
                suite={suite}
                key={suiteName}
              />
            ))}
          </div>
        </div>
        <button
          type='button'
          className='rounded-lg bg-gradient-to-r from-purple-500 via-purple-600 to-purple-700 px-5 py-2.5 text-center font-medium text-sm text-white shadow-lg shadow-purple-500/50 hover:bg-gradient-to-br focus:outline-none focus:ring-4 focus:ring-purple-300 dark:shadow-lg dark:shadow-purple-800/80 dark:focus:ring-purple-800'
          onClick={runBenchmarks}
        >
          Run Benchmarks
        </button>
      </div>
      <Suspense fallback={<BenchmarkFallback />}>
        <BenchmarkResults />
      </Suspense>
    </div>
  );
}
