import { useEffect, useRef, useState, type ReactNode } from 'react';
import tgpu, { d, type TgpuGuardedComputePipeline, type TgpuMutable, type TgpuRoot } from 'typegpu';

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

type CounterProgramState = {
  root: TgpuRoot;
  program: TgpuGuardedComputePipeline<[]>;
  countMutable: TgpuMutable<typeof d.u32>;
};

type IncrementByProgramState = {
  root: TgpuRoot;
  program: TgpuGuardedComputePipeline<[]>;
  stateMutable: TgpuMutable<typeof CounterState>;
  incrementBy: number;
};

type ProgramState = CounterProgramState | IncrementByProgramState;

type RunnableExample = {
  createState: () => Promise<ProgramState>;
  execute: (state: ProgramState) => Promise<void>;
};

type Props = {
  children: ReactNode;
  example: FirstGpuProgramExampleKey;
};

type ConsoleMethod = 'log' | 'debug' | 'info' | 'warn' | 'error';

const GPU_LOG_SETTLE_DELAY_MS = 100;
const consoleMethods: ConsoleMethod[] = ['log', 'debug', 'info', 'warn', 'error'];

async function waitForGpuLogs(root: TgpuRoot) {
  await root.device.queue.onSubmittedWorkDone();
  await new Promise((resolve) => setTimeout(resolve, GPU_LOG_SETTLE_DELAY_MS));
}

function stringifyConsoleArg(arg: unknown) {
  if (typeof arg === 'string') {
    return arg;
  }
  if (arg instanceof Error) {
    return `${arg.name}: ${arg.message}`;
  }
  return String(arg);
}

function formatConsoleArgs(args: unknown[]) {
  const [firstArg, ...rest] = args;

  if (typeof firstArg === 'string') {
    const styleMarkerCount = firstArg.match(/%c/g)?.length ?? 0;
    const text = firstArg.replaceAll('%c', '');
    const visibleArgs = rest.slice(styleMarkerCount).map(stringifyConsoleArg);
    return [text, ...visibleArgs].filter((part) => part.length > 0).join(' ');
  }

  return args.map(stringifyConsoleArg).join(' ');
}

class WebGpuInitializationError extends Error {
  constructor(error: unknown) {
    super(stringifyConsoleArg(error));
    this.name = 'WebGpuInitializationError';
  }
}

async function createRoot() {
  try {
    return await tgpu.init();
  } catch (error) {
    throw new WebGpuInitializationError(error);
  }
}

async function createCounterProgram(
  options: { logBeforeIncrement?: boolean } = {},
): Promise<CounterProgramState> {
  const root = await createRoot();
  const countMutable = root.createMutable(d.u32);

  const program = options.logBeforeIncrement
    ? root.createGuardedComputePipeline(() => {
        'use gpu';
        const currentCount = countMutable.$;
        console.log('current count:', currentCount);
        countMutable.$++;
      })
    : root.createGuardedComputePipeline(() => {
        'use gpu';
        countMutable.$++;
      });

  return { root, program, countMutable };
}

async function createIncrementByProgram(): Promise<IncrementByProgramState> {
  const root = await createRoot();
  const stateMutable = root.createMutable(CounterState, {
    counter: 0,
    incrementBy: 10,
  });

  const program = root.createGuardedComputePipeline(() => {
    'use gpu';
    stateMutable.$.counter += stateMutable.$.incrementBy;
  });

  return { root, program, stateMutable, incrementBy: 10 };
}

async function logIncrementByState(stateMutable: TgpuMutable<typeof CounterState>) {
  const state = await stateMutable.read();
  console.log(`counter: ${state.counter}, incrementBy: ${state.incrementBy}`);
}

const runnableExamples = {
  consoleLog: {
    createState: () => createCounterProgram({ logBeforeIncrement: true }),
    async execute(state) {
      state.program.dispatchThreads();
      await waitForGpuLogs(state.root);
    },
  },
  readValue: {
    createState: () => createCounterProgram(),
    async execute(state) {
      state.program.dispatchThreads();
      await state.root.device.queue.onSubmittedWorkDone();
      console.log(`Read value: ${await (state as CounterProgramState).countMutable.read()}`);
    },
  },
  updateIncrementBy: {
    createState: createIncrementByProgram,
    async execute(state) {
      const incrementState = state as IncrementByProgramState;
      incrementState.incrementBy++;
      incrementState.stateMutable.patch({ incrementBy: incrementState.incrementBy });
      incrementState.program.dispatchThreads();
      await logIncrementByState(incrementState.stateMutable);
    },
  },
} satisfies Record<FirstGpuProgramExampleKey, RunnableExample>;

function appendOutput(current: string, lines: string[]) {
  const nextOutput = lines.filter((line) => line.length > 0).join('\n');
  if (!nextOutput) {
    return current;
  }
  return current ? `${current}\n${nextOutput}` : nextOutput;
}

export default function RunnableTypeGpuExample({ children, example }: Props) {
  const [supported, setSupported] = useState<boolean | null>(null);
  const [output, setOutput] = useState('');
  const runningRef = useRef(false);
  const programRef = useRef<ProgramState | null>(null);
  const outputRef = useRef<HTMLPreElement | null>(null);
  const runnableExample = runnableExamples[example];

  useEffect(() => {
    let cancelled = false;

    async function checkSupport() {
      if (!navigator.gpu) {
        setSupported(false);
        return;
      }

      try {
        const adapter = await navigator.gpu.requestAdapter();
        if (!cancelled) {
          setSupported(adapter !== null);
        }
      } catch {
        if (!cancelled) {
          setSupported(false);
        }
      }
    }

    void checkSupport();

    return () => {
      cancelled = true;
      programRef.current?.root.destroy();
    };
  }, []);

  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [output]);

  async function runCode() {
    if (runningRef.current) {
      return;
    }

    runningRef.current = true;

    const capturedLines: string[] = [];
    const originals = Object.fromEntries(
      consoleMethods.map((method) => [method, console[method]]),
    ) as Record<ConsoleMethod, (...args: unknown[]) => void>;

    for (const method of consoleMethods) {
      console[method] = (...args: unknown[]) => {
        capturedLines.push(formatConsoleArgs(args));
        originals[method](...args);
      };
    }

    try {
      programRef.current ??= await runnableExample.createState();
      await runnableExample.execute(programRef.current);

      setOutput((current) => appendOutput(current, capturedLines));
    } catch (error) {
      programRef.current?.root.destroy();
      programRef.current = null;

      if (error instanceof WebGpuInitializationError) {
        setSupported(false);
      } else {
        setOutput((current) =>
          appendOutput(current, [...capturedLines, stringifyConsoleArg(error)]),
        );
      }
    } finally {
      for (const method of consoleMethods) {
        console[method] = originals[method];
      }
      runningRef.current = false;
    }
  }

  return (
    <div className="not-content my-6 overflow-hidden rounded-sm border border-[var(--sl-color-gray-5)] bg-[var(--sl-color-bg)] md:grid md:grid-cols-[minmax(0,1fr)_8rem]">
      <div className="min-w-0 overflow-auto [&_.expressive-code]:m-0 [&_.expressive-code_figure.frame]:rounded-none">
        {children}
      </div>
      <div className="grid min-h-0 min-w-0 grid-rows-[minmax(0,1fr)_auto] overflow-hidden border-t border-[var(--sl-color-gray-5)] md:h-0 md:min-h-full md:border-l md:border-t-0">
        {supported === false ? (
          <div className="flex min-h-48 min-w-0 items-center bg-[var(--sl-color-bg-inline-code)] p-3 text-xs leading-5 text-[var(--sl-color-text)] md:min-h-0">
            <p className="m-0">
              Running this code snippet requires WebGPU support, but a compatible GPU device could
              not be acquired in this browser.
            </p>
          </div>
        ) : (
          <>
            <pre
              aria-label="Console output"
              aria-readonly="true"
              className="m-0 min-h-48 min-w-0 overflow-auto whitespace-pre-wrap break-words bg-[var(--sl-color-bg-inline-code)] p-2 font-mono text-xs leading-5 text-[var(--sl-color-text)] focus:outline-none md:min-h-0"
              ref={outputRef}
              role="textbox"
              tabIndex={0}
            >
              {output || (
                <span className="text-[var(--sl-color-gray-3)]">
                  {supported === null ? 'Checking WebGPU support...' : 'Console output'}
                </span>
              )}
            </pre>
            <div className="flex justify-center border-t border-[var(--sl-color-gray-5)] bg-[var(--sl-color-bg)] p-2">
              <button
                className="rounded-sm border border-[var(--sl-color-gray-5)] bg-[var(--sl-color-bg)] px-2 py-1 text-xs font-medium text-[var(--sl-color-text)] hover:border-[var(--sl-color-text-accent)] hover:text-[var(--sl-color-text-accent)] focus:outline-none focus:ring-2 focus:ring-[var(--sl-color-accent)] disabled:cursor-not-allowed disabled:opacity-60"
                disabled={supported !== true}
                onClick={() => void runCode()}
                type="button"
              >
                Run execute()
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
