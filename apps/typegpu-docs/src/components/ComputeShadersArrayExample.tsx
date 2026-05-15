import type { ReactNode } from 'react';
import { d, type TgpuGuardedComputePipeline, type TgpuMutable, type TgpuRoot } from 'typegpu';
import {
  createExampleRoot,
  LinearCellGrid,
  RunnablePreviewHeader,
  RunnableSnippet,
} from './runnable/index.ts';

const VALUE_COUNT = 16;
const ValuesSchema = d.arrayOf(d.u32, VALUE_COUNT);

export const COMPUTE_SHADER_ARRAY_SNIPPET = `import tgpu, { d } from 'typegpu';

const root = await tgpu.init();

const valuesMutable = root.createMutable(d.arrayOf(d.u32, 16));

const program = root.createGuardedComputePipeline((x) => {
  'use gpu';
  valuesMutable.$[x]++;
});

export async function execute() {
  const threadCount = Math.floor(Math.random() * 16) + 1;
  program.dispatchThreads(threadCount);

  return {
    threadCount,
    values: await valuesMutable.read(),
  };
}
`;

type ArrayProgram = {
  program: TgpuGuardedComputePipeline<[number]>;
  root: TgpuRoot;
  valuesMutable: TgpuMutable<typeof ValuesSchema>;
};

type ArrayResult = {
  threadCount: number;
  values: readonly number[];
};

const INITIAL_VALUES: readonly number[] = Array.from({ length: VALUE_COUNT }, () => 0);

async function createArrayProgram(): Promise<ArrayProgram> {
  const root = await createExampleRoot();
  const valuesMutable = root.createMutable(ValuesSchema);

  const program = root.createGuardedComputePipeline((x) => {
    'use gpu';
    valuesMutable.$[x]++;
  });

  return { program, root, valuesMutable };
}

type Props = {
  children: ReactNode;
};

export default function ComputeShadersArrayExample({ children }: Props) {
  return (
    <RunnableSnippet<ArrayProgram, ArrayResult>
      createProgram={() => createArrayProgram()}
      preview={({ lastResult }) => {
        const threadCount = lastResult?.threadCount ?? 0;
        const values = lastResult?.values ?? INITIAL_VALUES;

        return (
          <>
            <RunnablePreviewHeader
              label="Values"
              value={
                threadCount === 0
                  ? 'Not run'
                  : `${threadCount} thread${threadCount === 1 ? '' : 's'}`
              }
            />
            <LinearCellGrid columns={VALUE_COUNT} highlightCount={threadCount} values={values} />
          </>
        );
      }}
      run={async ({ program, valuesMutable }) => {
        const threadCount = Math.floor(Math.random() * VALUE_COUNT) + 1;
        program.dispatchThreads(threadCount);
        const values = await valuesMutable.read();
        return { threadCount, values: [...values] };
      }}
    >
      {children}
    </RunnableSnippet>
  );
}
