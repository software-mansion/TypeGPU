import { Play } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import tgpu, { d, type TgpuGuardedComputePipeline, type TgpuMutable, type TgpuRoot } from 'typegpu';

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

type DispatchSize = {
  width: number;
  height: number;
};

type GridProgramState = {
  root: TgpuRoot;
  program: TgpuGuardedComputePipeline<[number, number]>;
  valuesMutable: TgpuMutable<typeof GridSchema>;
};

type Props = {
  children: ReactNode;
};

function createInitialGrid() {
  return Array.from({ length: GRID_WIDTH }, () => Array.from({ length: GRID_HEIGHT }, () => 0));
}

function getRandomDispatchSize(): DispatchSize {
  return {
    width: Math.floor(Math.random() * GRID_WIDTH) + 1,
    height: Math.floor(Math.random() * GRID_HEIGHT) + 1,
  };
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

async function createGridProgram(): Promise<GridProgramState> {
  const root = await createRoot();
  const valuesMutable = root.createMutable(GridSchema);

  const program = root.createGuardedComputePipeline((x, y) => {
    'use gpu';
    valuesMutable.$[x][y]++;
  });

  return { root, program, valuesMutable };
}

export default function ComputeShadersGridExample({ children }: Props) {
  const [supported, setSupported] = useState<boolean | null>(null);
  const [values, setValues] = useState(createInitialGrid);
  const [lastDispatchSize, setLastDispatchSize] = useState<DispatchSize | null>(null);
  const [error, setError] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const runningRef = useRef(false);
  const programRef = useRef<GridProgramState | null>(null);

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
      programRef.current ??= await createGridProgram();
      const dispatchSize = getRandomDispatchSize();
      programRef.current.program.dispatchThreads(dispatchSize.width, dispatchSize.height);

      const nextValues = await programRef.current.valuesMutable.read();
      setValues(nextValues.map((column) => [...column]));
      setLastDispatchSize(dispatchSize);
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
    <div className="not-content my-6 overflow-hidden rounded-sm border border-[var(--sl-color-gray-5)] bg-[var(--sl-color-bg)] md:grid md:grid-cols-[minmax(0,1fr)_13rem]">
      <div className="min-w-0 overflow-auto [&_.expressive-code]:m-0 [&_.expressive-code_figure.frame]:rounded-none">
        {children}
      </div>
      <div className="grid min-h-0 min-w-0 grid-rows-[minmax(0,1fr)_auto] overflow-hidden border-t border-[var(--sl-color-gray-5)] md:h-0 md:min-h-full md:border-l md:border-t-0">
        {supported === false ? (
          <div className="flex min-h-44 min-w-0 items-center bg-[var(--sl-color-bg-inline-code)] p-3 text-xs leading-5 text-[var(--sl-color-text)] md:min-h-0">
            <p className="m-0">
              Running this code snippet requires WebGPU support, but a compatible GPU device could
              not be acquired in this browser.
            </p>
          </div>
        ) : (
          <>
            <div className="min-h-44 min-w-0 overflow-auto bg-[var(--sl-color-bg-inline-code)] p-3 md:min-h-0">
              <div className="mb-3 flex items-center justify-between gap-2 text-xs text-[var(--sl-color-gray-2)]">
                <span className="font-medium text-[var(--sl-color-text)]">Grid</span>
                <span>
                  {lastDispatchSize === null
                    ? 'Not run'
                    : `${lastDispatchSize.width} x ${lastDispatchSize.height}`}
                </span>
              </div>
              <div
                className="grid gap-1"
                style={{ gridTemplateColumns: `repeat(${GRID_WIDTH}, minmax(0, 1fr))` }}
              >
                {Array.from({ length: GRID_HEIGHT }, (_, y) =>
                  Array.from({ length: GRID_WIDTH }, (_, x) => {
                    const wasTouched =
                      lastDispatchSize !== null &&
                      x < lastDispatchSize.width &&
                      y < lastDispatchSize.height;

                    return (
                      <div
                        aria-label={`Column ${x}, row ${y}: ${values[x]?.[y] ?? 0}`}
                        className={`flex h-8 min-w-0 items-center justify-center rounded-sm border bg-[var(--sl-color-bg)] px-1 text-center font-mono text-xs font-semibold leading-none ${
                          wasTouched
                            ? 'border-[var(--sl-color-accent)] text-[var(--sl-color-text-accent)]'
                            : 'border-[var(--sl-color-gray-5)] text-[var(--sl-color-text)]'
                        }`}
                        key={`${x}-${y}`}
                      >
                        {values[x]?.[y] ?? 0}
                      </div>
                    );
                  }),
                )}
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
