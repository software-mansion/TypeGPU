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
      <div className='gap-4 mx-auto p-4 my-10 flex flex-col items-center justify-between w-96 border border-gray-200 rounded-lg bg-gray-50 dark:bg-gray-800 dark:border-gray-700'>
        <div>
          <p className='w-full text-lg mb-2'>Versions to compare:</p>
          <ul className='w-full flex flex-col items-start gap-1 my-1 list-none p-0 m-0'>
            {parameterSetAtoms.map((paramsAtom, index) => (
              <li
                // biome-ignore lint/suspicious/noArrayIndexKey: <it's fine React>
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
              className='cursor-pointer select-none p-2 flex justify-center items-center w-10 h-10 bg-transparent text-white transition-colors hover:bg-gray-700 rounded-md text-sm text-center me-2'
              onClick={createParameterSet}
            >
              <CirclePlus />
            </button>
          </div>
        </div>
        <div className='w-full'>
          <p className='text-lg mb-2'>Benchmark suites to run:</p>
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
          className='text-white bg-gradient-to-r from-purple-500 via-purple-600 to-purple-700 hover:bg-gradient-to-br focus:ring-4 focus:outline-none focus:ring-purple-300 dark:focus:ring-purple-800 shadow-lg shadow-purple-500/50 dark:shadow-lg dark:shadow-purple-800/80 font-medium rounded-lg text-sm px-5 py-2.5 text-center'
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
