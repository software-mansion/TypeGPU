import { Play } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import tgpu, { type TgpuRoot } from 'typegpu';
import { useConsoleCapture } from './useConsoleCapture.ts';

const unsupportedMessage =
  'Running this code snippet requires WebGPU support, but a compatible GPU device could not be acquired in this browser.';

const GPU_LOG_SETTLE_DELAY_MS = 100;

export type RootedProgram = {
  root: TgpuRoot;
};

export function stringifyError(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

export class WebGpuInitializationError extends Error {
  constructor(error: unknown) {
    super(stringifyError(error));
    this.name = 'WebGpuInitializationError';
  }
}

export async function createExampleRoot() {
  try {
    return await tgpu.init();
  } catch (error) {
    throw new WebGpuInitializationError(error);
  }
}

export async function waitForGpuLogs(root: TgpuRoot) {
  await root.device.queue.onSubmittedWorkDone();
  await new Promise((resolve) => setTimeout(resolve, GPU_LOG_SETTLE_DELAY_MS));
}

export type RunnerHandle<TProgram extends RootedProgram> = {
  error: string;
  getProgram: () => Promise<TProgram>;
  handleError: (error: unknown) => void;
  isRunning: boolean;
  runExclusive: (action: (program: TProgram) => Promise<void> | void) => Promise<void>;
  supported: boolean | null;
};

export function useWebGpuProgram<TProgram extends RootedProgram>(
  createProgram: () => Promise<TProgram>,
): RunnerHandle<TProgram> {
  const [supported, setSupported] = useState<boolean | null>(null);
  const [error, setError] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const createProgramRef = useRef(createProgram);
  const programRef = useRef<TProgram | null>(null);
  const programPromiseRef = useRef<Promise<TProgram> | null>(null);
  const runningRef = useRef(false);

  createProgramRef.current = createProgram;

  function discardProgram() {
    programRef.current?.root.destroy();
    programRef.current = null;
    programPromiseRef.current = null;
  }

  async function getProgram() {
    if (programRef.current) {
      return programRef.current;
    }

    programPromiseRef.current ??= createProgramRef.current().then((program) => {
      programRef.current = program;
      return program;
    });

    return programPromiseRef.current;
  }

  function handleError(runError: unknown) {
    discardProgram();

    if (runError instanceof WebGpuInitializationError) {
      setSupported(false);
    } else {
      setError(stringifyError(runError));
    }
  }

  async function runExclusive(action: (program: TProgram) => Promise<void> | void) {
    if (runningRef.current) {
      return;
    }

    runningRef.current = true;
    setIsRunning(true);
    setError('');

    try {
      await action(await getProgram());
    } catch (runError) {
      handleError(runError);
    } finally {
      runningRef.current = false;
      setIsRunning(false);
    }
  }

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
      discardProgram();
    };
  }, []);

  return {
    error,
    getProgram,
    handleError,
    isRunning,
    runExclusive,
    supported,
  };
}

function cx(...classes: Array<false | null | string | undefined>) {
  return classes.filter(Boolean).join(' ');
}

export type RunnablePreviewHeaderProps = {
  label: ReactNode;
  value: ReactNode;
};

export function RunnablePreviewHeader({ label, value }: RunnablePreviewHeaderProps) {
  return (
    <div className="mb-3 flex items-center justify-between gap-2 text-xs text-[var(--sl-color-gray-2)]">
      <span className="font-medium text-[var(--sl-color-text)]">{label}</span>
      <span>{value}</span>
    </div>
  );
}

type RunnableSnippetShellProps<TProgram extends RootedProgram> = {
  children: ReactNode;
  controls?: ReactNode;
  onRun: () => void;
  panelWidth?: string;
  preview: ReactNode;
  runner: Pick<RunnerHandle<TProgram>, 'error' | 'isRunning' | 'supported'>;
  tall?: boolean;
};

export function RunnableSnippetShell<TProgram extends RootedProgram>({
  children,
  controls,
  onRun,
  panelWidth = '10rem',
  preview,
  runner,
  tall = false,
}: RunnableSnippetShellProps<TProgram>) {
  const outerStyle = {
    '--runnable-panel-width': panelWidth,
  } as React.CSSProperties;

  return (
    <div
      className={cx(
        'not-content my-6 overflow-hidden rounded-sm border border-[var(--sl-color-gray-5)] bg-[var(--sl-color-bg)] md:grid md:grid-cols-[minmax(0,1fr)_var(--runnable-panel-width)]',
        tall && 'md:h-[34rem]',
      )}
      style={outerStyle}
    >
      <div
        className={cx(
          'min-w-0 overflow-auto [&_.expressive-code]:m-0 [&_.expressive-code_figure.frame]:rounded-none',
          tall && 'h-[28rem] md:h-full',
        )}
      >
        {children}
      </div>
      <div
        className={cx(
          'grid min-h-0 min-w-0 overflow-hidden border-t border-[var(--sl-color-gray-5)] md:h-0 md:min-h-full md:border-l md:border-t-0',
          controls ? 'grid-rows-[auto_minmax(0,1fr)_auto]' : 'grid-rows-[minmax(0,1fr)_auto]',
        )}
      >
        {runner.supported === false ? (
          <div className="flex min-w-0 items-center bg-[var(--sl-color-bg-inline-code)] p-3 text-xs leading-5 text-[var(--sl-color-text)] md:min-h-0">
            <p className="m-0">{unsupportedMessage}</p>
          </div>
        ) : (
          <>
            {controls}
            <div className="min-h-56 min-w-0 overflow-auto bg-[var(--sl-color-bg-inline-code)] p-3 md:min-h-0">
              {preview}
              {runner.error ? (
                <p className="mt-3 break-words text-xs leading-5 text-[var(--sl-color-text)]">
                  {runner.error}
                </p>
              ) : null}
            </div>
            <div className="flex justify-center border-t border-[var(--sl-color-gray-5)] bg-[var(--sl-color-bg)] p-2">
              <button
                className="inline-flex items-center gap-1.5 rounded-sm border border-[var(--sl-color-gray-5)] bg-[var(--sl-color-bg)] px-2 py-1 text-xs font-medium text-[var(--sl-color-text)] hover:text-[var(--sl-color-text-accent)] focus:outline-none focus:ring-2 focus:ring-[var(--sl-color-accent)] disabled:cursor-not-allowed disabled:opacity-60"
                disabled={runner.supported !== true || runner.isRunning}
                onClick={onRun}
                type="button"
              >
                <Play aria-hidden="true" className="h-3.5 w-3.5" />
                {runner.isRunning ? 'Running...' : 'Run'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export type RunnableSnippetState<TProgram extends RootedProgram, TResult> = {
  canvas: ReactNode | null;
  lastResult: TResult | null;
  output: string;
  runIndex: number;
  runner: RunnerHandle<TProgram>;
};

export type RunnableSnippetProps<TProgram extends RootedProgram, TResult> = {
  captureConsole?: boolean;
  children: ReactNode;
  controls?: (state: RunnableSnippetState<TProgram, TResult>) => ReactNode;
  createProgram: (ctx: { canvas: HTMLCanvasElement | null }) => Promise<TProgram>;
  panelWidth?: string;
  preview: (state: RunnableSnippetState<TProgram, TResult>) => ReactNode;
  run: (
    program: TProgram,
    ctx: { previousResult: TResult | null; runIndex: number },
  ) => TResult | Promise<TResult>;
  tall?: boolean;
  withCanvas?: { ariaLabel?: string; size: number };
};

export function RunnableSnippet<TProgram extends RootedProgram, TResult = void>({
  captureConsole = false,
  children,
  controls,
  createProgram,
  panelWidth,
  preview,
  run,
  tall,
  withCanvas,
}: RunnableSnippetProps<TProgram, TResult>) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const consoleCapture = useConsoleCapture();
  const [lastResult, setLastResult] = useState<TResult | null>(null);
  const [runIndex, setRunIndex] = useState(0);
  const lastResultRef = useRef<TResult | null>(null);
  const runIndexRef = useRef(0);

  lastResultRef.current = lastResult;
  runIndexRef.current = runIndex;

  const runner = useWebGpuProgram<TProgram>(() => {
    const canvas = withCanvas ? canvasRef.current : null;
    if (withCanvas && !canvas) {
      throw new Error('The WebGPU canvas is not ready yet.');
    }
    return createProgram({ canvas });
  });

  async function executeRun(program: TProgram) {
    const nextRunIndex = runIndexRef.current + 1;
    const result = await run(program, {
      previousResult: lastResultRef.current,
      runIndex: nextRunIndex,
    });
    setLastResult(result);
    setRunIndex(nextRunIndex);
  }

  async function handleRun() {
    await runner.runExclusive(async (program) => {
      if (captureConsole) {
        await consoleCapture.captureDuring(async () => {
          await executeRun(program);
          // GPU-side console.log fires after submitted work completes; wait
          // before tearing down the capture so shader logs are recorded.
          await waitForGpuLogs(program.root);
        });
      } else {
        await executeRun(program);
      }
    });
  }

  const canvasNode = withCanvas ? (
    <canvas
      aria-label={withCanvas.ariaLabel}
      className="block aspect-square w-full rounded-sm border border-[var(--sl-color-gray-5)] bg-[#171526]"
      height={withCanvas.size}
      ref={canvasRef}
      width={withCanvas.size}
    />
  ) : null;

  const state: RunnableSnippetState<TProgram, TResult> = {
    canvas: canvasNode,
    lastResult,
    output: consoleCapture.output,
    runIndex,
    runner,
  };

  return (
    <RunnableSnippetShell
      controls={controls?.(state)}
      onRun={() => void handleRun()}
      panelWidth={panelWidth}
      preview={preview(state)}
      runner={runner}
      tall={tall}
    >
      {children}
    </RunnableSnippetShell>
  );
}
