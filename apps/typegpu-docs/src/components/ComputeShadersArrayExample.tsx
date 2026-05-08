import { Play } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import tgpu, { d, type TgpuGuardedComputePipeline, type TgpuMutable, type TgpuRoot } from 'typegpu';

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

type ArrayProgramState = {
  root: TgpuRoot;
  program: TgpuGuardedComputePipeline<[number]>;
  valuesMutable: TgpuMutable<typeof ValuesSchema>;
};

type Props = {
  children: ReactNode;
};

function createInitialValues() {
  return Array.from({ length: VALUE_COUNT }, () => 0);
}

function getRandomThreadCount() {
  return Math.floor(Math.random() * VALUE_COUNT) + 1;
}

function stringifyError(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

class WebGpuInitializationError extends Error {
  constructor(error: unknown) {
    super(stringifyError(error));
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

async function createArrayProgram(): Promise<ArrayProgramState> {
  const root = await createRoot();
  const valuesMutable = root.createMutable(ValuesSchema);

  const program = root.createGuardedComputePipeline((x) => {
    'use gpu';
    valuesMutable.$[x]++;
  });

  return { root, program, valuesMutable };
}

export default function ComputeShadersArrayExample({ children }: Props) {
  const [supported, setSupported] = useState<boolean | null>(null);
  const [values, setValues] = useState(createInitialValues);
  const [lastThreadCount, setLastThreadCount] = useState(0);
  const [error, setError] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const runningRef = useRef(false);
  const programRef = useRef<ArrayProgramState | null>(null);

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

  async function runCode() {
    if (runningRef.current) {
      return;
    }

    runningRef.current = true;
    setIsRunning(true);
    setError('');

    try {
      programRef.current ??= await createArrayProgram();
      const threadCount = getRandomThreadCount();
      programRef.current.program.dispatchThreads(threadCount);

      const nextValues = await programRef.current.valuesMutable.read();
      setValues([...nextValues]);
      setLastThreadCount(threadCount);
    } catch (runError) {
      programRef.current?.root.destroy();
      programRef.current = null;

      if (runError instanceof WebGpuInitializationError) {
        setSupported(false);
      } else {
        setError(stringifyError(runError));
      }
    } finally {
      runningRef.current = false;
      setIsRunning(false);
    }
  }

  return (
    <div className="not-content my-6 overflow-hidden rounded-sm border border-[var(--sl-color-gray-5)] bg-[var(--sl-color-bg)] md:grid md:grid-cols-[minmax(0,1fr)_10rem]">
      <div className="min-w-0 overflow-auto [&_.expressive-code]:m-0 [&_.expressive-code_figure.frame]:rounded-none">
        {children}
      </div>
      <div className="grid min-h-0 min-w-0 grid-rows-[minmax(0,1fr)_auto] overflow-hidden border-t border-[var(--sl-color-gray-5)] md:h-0 md:min-h-full md:border-l md:border-t-0">
        {supported === false ? (
          <div className="flex min-h-56 min-w-0 items-center bg-[var(--sl-color-bg-inline-code)] p-3 text-xs leading-5 text-[var(--sl-color-text)] md:min-h-0">
            <p className="m-0">
              Running this code snippet requires WebGPU support, but a compatible GPU device could
              not be acquired in this browser.
            </p>
          </div>
        ) : (
          <>
            <div className="min-h-56 min-w-0 overflow-auto bg-[var(--sl-color-bg-inline-code)] p-3 md:min-h-0">
              <div className="mb-3 flex items-center justify-between gap-2 text-xs text-[var(--sl-color-gray-2)]">
                <span className="font-medium text-[var(--sl-color-text)]">Values</span>
                <span>
                  {lastThreadCount === 0
                    ? 'Not run'
                    : `${lastThreadCount} thread${lastThreadCount === 1 ? '' : 's'}`}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                {values.map((value, index) => {
                  const wasTouched = index < lastThreadCount;

                  return (
                    <div
                      aria-label={`Index ${index}: ${value}`}
                      className={`grid h-8 min-w-0 grid-rows-[auto_1fr] rounded-sm border bg-[var(--sl-color-bg)] px-1 py-0.5 text-center ${
                        wasTouched
                          ? 'border-[var(--sl-color-accent)]'
                          : 'border-[var(--sl-color-gray-5)]'
                      }`}
                      key={index}
                    >
                      <span className="font-mono text-[0.65rem] leading-none text-[var(--sl-color-gray-3)]">
                        {index}
                      </span>
                      <span
                        className={`flex items-center justify-center font-mono text-xs font-semibold leading-none ${
                          wasTouched
                            ? 'text-[var(--sl-color-text-accent)]'
                            : 'text-[var(--sl-color-text)]'
                        }`}
                      >
                        {value}
                      </span>
                    </div>
                  );
                })}
              </div>
              {error ? (
                <p className="mt-3 break-words text-xs leading-5 text-[var(--sl-color-text)]">
                  {error}
                </p>
              ) : null}
            </div>
            <div className="flex justify-center border-t border-[var(--sl-color-gray-5)] bg-[var(--sl-color-bg)] p-2">
              <button
                className="inline-flex items-center gap-1.5 rounded-sm border border-[var(--sl-color-gray-5)] bg-[var(--sl-color-bg)] px-2 py-1 text-xs font-medium text-[var(--sl-color-text)] hover:border-[var(--sl-color-text-accent)] hover:text-[var(--sl-color-text-accent)] focus:outline-none focus:ring-2 focus:ring-[var(--sl-color-accent)] disabled:cursor-not-allowed disabled:opacity-60"
                disabled={supported !== true || isRunning}
                onClick={() => void runCode()}
                type="button"
              >
                <Play aria-hidden="true" className="h-3.5 w-3.5" />
                {isRunning ? 'Running...' : 'Run'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
