import type { ReactNode } from 'react';
import { d, type TgpuGuardedComputePipeline, type TgpuMutable, type TgpuRoot } from 'typegpu';
import { ConsolePreview, createExampleRoot, RunnableSnippet } from './runnable/index.ts';

const CounterState = d.struct({
  counter: d.u32,
  incrementBy: d.u32,
});

export const FIRST_GPU_PROGRAM_SNIPPETS = {
  consoleLog: `import tgpu, { d } from 'typegpu';

const root = await tgpu.init();

// ---cut---
const countMutable = root.createMutable(d.u32);

const program = root.createGuardedComputePipeline(() => {
  'use gpu';
  const currentCount = countMutable.$;
  console.log('current count:', currentCount);
  countMutable.$++;
});

function increment() {
  program.dispatchThreads();
}

export function execute() {
  increment();
}
`,

  readValue: `import tgpu, { d } from 'typegpu';

const root = await tgpu.init();

// ---cut---
const countMutable = root.createMutable(d.u32);

const program = root.createGuardedComputePipeline(() => {
  'use gpu';
  countMutable.$++;
});

function increment() {
  program.dispatchThreads();
}

export async function execute() {
  increment();
  const value = await countMutable.read();
  console.log(\`Read value: \${value}\`);
}
`,

  updateIncrementBy: `import tgpu, { d } from 'typegpu';

const root = await tgpu.init();

// ---cut---
let incrementBy = 10;

const stateMutable = root.createMutable(
  d.struct({ counter: d.u32, incrementBy: d.u32 }),
  { counter: 0, incrementBy },
);

const program = root.createGuardedComputePipeline(() => {
  'use gpu';
  stateMutable.$.counter += stateMutable.$.incrementBy;
});

export async function execute() {
  incrementBy++;
  stateMutable.patch({ incrementBy });
  program.dispatchThreads();

  const state = await stateMutable.read();
  console.log(
    \`counter: \${state.counter}, incrementBy: \${state.incrementBy}\`,
  );
}
`,
} as const;

export type FirstGpuProgramExampleKey = keyof typeof FIRST_GPU_PROGRAM_SNIPPETS;

type CounterProgram = {
  countMutable: TgpuMutable<typeof d.u32>;
  program: TgpuGuardedComputePipeline<[]>;
  root: TgpuRoot;
};

type IncrementByProgram = {
  program: TgpuGuardedComputePipeline<[]>;
  root: TgpuRoot;
  stateMutable: TgpuMutable<typeof CounterState>;
};

async function createConsoleLogProgram(): Promise<CounterProgram> {
  const root = await createExampleRoot();
  const countMutable = root.createMutable(d.u32);
  const program = root.createGuardedComputePipeline(() => {
    'use gpu';
    const currentCount = countMutable.$;
    console.log('current count:', currentCount);
    countMutable.$++;
  });
  return { countMutable, program, root };
}

async function createReadValueProgram(): Promise<CounterProgram> {
  const root = await createExampleRoot();
  const countMutable = root.createMutable(d.u32);
  const program = root.createGuardedComputePipeline(() => {
    'use gpu';
    countMutable.$++;
  });
  return { countMutable, program, root };
}

async function createIncrementByProgram(): Promise<
  IncrementByProgram & { incrementBy: { current: number } }
> {
  const root = await createExampleRoot();
  const stateMutable = root.createMutable(CounterState, {
    counter: 0,
    incrementBy: 10,
  });
  const program = root.createGuardedComputePipeline(() => {
    'use gpu';
    stateMutable.$.counter += stateMutable.$.incrementBy;
  });
  return { incrementBy: { current: 10 }, program, root, stateMutable };
}

type Props = {
  children: ReactNode;
  example: FirstGpuProgramExampleKey;
};

type ConsolePreviewState = {
  output: string;
  runner: { supported: boolean | null };
};

function renderConsolePreview({ output, runner }: ConsolePreviewState) {
  return (
    <ConsolePreview
      output={output}
      placeholder={runner.supported === null ? 'Checking WebGPU support...' : 'Console output'}
    />
  );
}

export default function FirstGpuProgramExample({ children, example }: Props) {
  if (example === 'consoleLog') {
    return (
      <RunnableSnippet<CounterProgram, void>
        captureConsole
        createProgram={() => createConsoleLogProgram()}
        preview={renderConsolePreview}
        run={({ program }) => {
          program.dispatchThreads();
        }}
      >
        {children}
      </RunnableSnippet>
    );
  }

  if (example === 'readValue') {
    return (
      <RunnableSnippet<CounterProgram, void>
        captureConsole
        createProgram={() => createReadValueProgram()}
        preview={renderConsolePreview}
        run={async ({ countMutable, program }) => {
          program.dispatchThreads();
          console.log(`Read value: ${await countMutable.read()}`);
        }}
      >
        {children}
      </RunnableSnippet>
    );
  }

  return (
    <RunnableSnippet<Awaited<ReturnType<typeof createIncrementByProgram>>, void>
      captureConsole
      createProgram={() => createIncrementByProgram()}
      preview={renderConsolePreview}
      run={async ({ incrementBy, program, stateMutable }) => {
        incrementBy.current++;
        stateMutable.patch({ incrementBy: incrementBy.current });
        program.dispatchThreads();
        const state = await stateMutable.read();
        console.log(`counter: ${state.counter}, incrementBy: ${state.incrementBy}`);
      }}
    >
      {children}
    </RunnableSnippet>
  );
}
