import type { ReactNode } from 'react';
import { d, type TgpuGuardedComputePipeline, type TgpuMutable, type TgpuRoot } from 'typegpu';
import {
  createExampleRoot,
  RectangleCellGrid,
  RunnablePreviewHeader,
  RunnableSnippet,
} from './runnable/index.ts';

const GRID_WIDTH = 6;
const GRID_HEIGHT = 8;
const GridSchema = d.arrayOf(d.arrayOf(d.u32, GRID_HEIGHT), GRID_WIDTH);

export const COMPUTE_SHADER_GRID_SNIPPET = `import tgpu, { d } from 'typegpu';

const root = await tgpu.init();

const WIDTH = 6;
const HEIGHT = 8;

const valuesMutable = root.createMutable(
  d.arrayOf(d.arrayOf(d.u32, HEIGHT), WIDTH),
);

const program = root.createGuardedComputePipeline((x, y) => {
  'use gpu';
  valuesMutable.$[x][y]++;
});

export async function execute() {
  const dispatchWidth = Math.floor(Math.random() * WIDTH) + 1;
  const dispatchHeight = Math.floor(Math.random() * HEIGHT) + 1;
  program.dispatchThreads(dispatchWidth, dispatchHeight);

  return {
    dispatchWidth,
    dispatchHeight,
    values: await valuesMutable.read(),
  };
}
`;

type GridProgram = {
  program: TgpuGuardedComputePipeline<[number, number]>;
  root: TgpuRoot;
  valuesMutable: TgpuMutable<typeof GridSchema>;
};

type GridResult = {
  dispatch: { height: number; width: number };
  values: readonly (readonly number[])[];
};

const INITIAL_GRID: readonly (readonly number[])[] = Array.from({ length: GRID_WIDTH }, () =>
  Array.from({ length: GRID_HEIGHT }, () => 0),
);

async function createGridProgram(): Promise<GridProgram> {
  const root = await createExampleRoot();
  const valuesMutable = root.createMutable(GridSchema);

  const program = root.createGuardedComputePipeline((x, y) => {
    'use gpu';
    valuesMutable.$[x][y]++;
  });

  return { program, root, valuesMutable };
}

type Props = {
  children: ReactNode;
};

export default function ComputeShadersGridExample({ children }: Props) {
  return (
    <RunnableSnippet<GridProgram, GridResult>
      createProgram={() => createGridProgram()}
      panelWidth="13rem"
      preview={({ lastResult }) => {
        const dispatch = lastResult?.dispatch ?? null;
        const values = lastResult?.values ?? INITIAL_GRID;

        return (
          <>
            <RunnablePreviewHeader
              label="Grid"
              value={dispatch === null ? 'Not run' : `${dispatch.width} x ${dispatch.height}`}
            />
            <RectangleCellGrid
              height={GRID_HEIGHT}
              highlight={dispatch}
              values={values}
              width={GRID_WIDTH}
            />
          </>
        );
      }}
      run={async ({ program, valuesMutable }) => {
        const width = Math.floor(Math.random() * GRID_WIDTH) + 1;
        const height = Math.floor(Math.random() * GRID_HEIGHT) + 1;
        program.dispatchThreads(width, height);
        const values = await valuesMutable.read();
        return {
          dispatch: { height, width },
          values: values.map((column) => [...column]),
        };
      }}
    >
      {children}
    </RunnableSnippet>
  );
}
