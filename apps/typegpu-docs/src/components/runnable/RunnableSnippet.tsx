import { Play } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import tgpu, { type TgpuRoot } from 'typegpu';
import { useConsoleCapture } from './useConsoleCapture.ts';

const unsupportedMessage =
  'Running this code snippet requires WebGPU support, but a compatible GPU device could not be acquired in this browser.';

const DEFAULT_CANVAS_SIZE = 768;
const GPU_LOG_SETTLE_DELAY_MS = 100;

export type RootedProgram = {
  root: TgpuRoot;
};

function stringifyError(error: unknown) {
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

async function waitForGpuLogs(root: TgpuRoot) {
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

function useWebGpuProgram<TProgram extends RootedProgram>(
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

type RunnerStatus = Pick<RunnerHandle<RootedProgram>, 'error' | 'isRunning' | 'supported'>;

type RunnableSnippetShellProps = {
  children: ReactNode;
  compactPreview?: boolean;
  controls?: ReactNode;
  onRun: () => void;
  preview: ReactNode;
  runner: RunnerStatus;
  scrollCode?: boolean;
};

type RunButtonProps = {
  onRun: () => void;
  runner: Pick<RunnerStatus, 'isRunning' | 'supported'>;
};

function RunButton({ onRun, runner }: RunButtonProps) {
  return (
    <button
      className="inline-grid w-24 grid-cols-[auto_1fr] items-center gap-1.5 rounded-sm border border-[var(--sl-color-gray-5)] bg-[var(--sl-color-bg)] px-2 py-1 text-xs font-medium text-[var(--sl-color-text)] hover:text-[var(--sl-color-text-accent)] focus:outline-none focus:ring-2 focus:ring-[var(--sl-color-accent)] disabled:cursor-not-allowed disabled:opacity-60"
      disabled={runner.supported !== true || runner.isRunning}
      onClick={onRun}
      type="button"
    >
      <Play aria-hidden="true" className="h-3.5 w-3.5" />
      <span>{runner.isRunning ? 'Running...' : 'Run'}</span>
    </button>
  );
}

type PreviewPaneProps = {
  children: ReactNode;
  compact: boolean;
  error: string;
  fixedHeight: boolean;
};

function PreviewPane({ children, compact, error, fixedHeight }: PreviewPaneProps) {
  return (
    <div
      className={cx(
        'min-w-0 overflow-auto bg-[var(--sl-color-bg-inline-code)] p-3',
        fixedHeight ? (compact ? 'h-36' : 'h-56') : 'min-h-56 md:min-h-0',
      )}
    >
      {children}
      {error ? (
        <p className="mt-3 break-words text-xs leading-5 text-[var(--sl-color-text)]">{error}</p>
      ) : null}
    </div>
  );
}

function RunnableSnippetShell({
  children,
  compactPreview = false,
  controls,
  onRun,
  preview,
  runner,
  scrollCode = false,
}: RunnableSnippetShellProps) {
  const hasControls = controls !== undefined && controls !== null;
  const runButton = <RunButton onRun={onRun} runner={runner} />;

  return (
    <div className="not-content my-6 overflow-hidden rounded-sm border border-[var(--sl-color-gray-5)] bg-[var(--sl-color-bg)]">
      <div
        className={cx(
          'min-w-0 overflow-auto [&_.expressive-code]:m-0 [&_.expressive-code_figure.frame]:rounded-none',
          scrollCode && 'h-[28rem]',
        )}
      >
        {children}
      </div>
      {runner.supported === false ? (
        <div className="flex min-w-0 items-center border-t border-[var(--sl-color-gray-5)] bg-[var(--sl-color-bg-inline-code)] p-3 text-xs leading-5 text-[var(--sl-color-text)]">
          <p className="m-0">{unsupportedMessage}</p>
        </div>
      ) : (
        <div
          className={cx(
            'grid min-h-0 min-w-0 overflow-hidden border-t border-[var(--sl-color-gray-5)]',
            hasControls
              ? 'md:grid-cols-[minmax(0,1fr)_12rem]'
              : 'md:grid-cols-[minmax(0,1fr)_8rem]',
          )}
        >
          <PreviewPane compact={compactPreview} error={runner.error} fixedHeight={!hasControls}>
            {preview}
          </PreviewPane>
          <div
            className={cx(
              'grid border-t border-[var(--sl-color-gray-5)] bg-[var(--sl-color-bg)] md:border-l md:border-t-0',
              hasControls
                ? 'min-w-0 grid-rows-[auto_minmax(0,1fr)_auto]'
                : 'md:grid-rows-[minmax(0,1fr)_auto]',
            )}
          >
            {hasControls ? (
              <>
                <div className="min-w-0">{controls}</div>
                <div aria-hidden="true" />
              </>
            ) : (
              <div aria-hidden="true" className="hidden md:block" />
            )}
            <div
              className={cx(
                'grid place-items-center p-2',
                hasControls
                  ? 'border-t border-[var(--sl-color-gray-5)]'
                  : 'md:border-t md:border-[var(--sl-color-gray-5)] md:px-3',
              )}
            >
              {runButton}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export type RunnableSnippetState<TProgram extends RootedProgram, TResult> = {
  canvas: ReactNode | null;
  lastResult: TResult | null;
  output: string;
  runner: RunnerHandle<TProgram>;
};

export type RunnableSnippetProps<TProgram extends RootedProgram, TResult> = {
  captureConsole?: boolean;
  children: ReactNode;
  controls?: (state: RunnableSnippetState<TProgram, TResult>) => ReactNode;
  createProgram: (ctx: { canvas: HTMLCanvasElement | null }) => Promise<TProgram>;
  preview: (state: RunnableSnippetState<TProgram, TResult>) => ReactNode;
  run: (program: TProgram) => TResult | Promise<TResult>;
  withCanvas?: { ariaLabel?: string };
};

export function RunnableSnippet<TProgram extends RootedProgram, TResult = void>({
  captureConsole = false,
  children,
  controls,
  createProgram,
  preview,
  run,
  withCanvas,
}: RunnableSnippetProps<TProgram, TResult>) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const consoleCapture = useConsoleCapture();
  const [lastResult, setLastResult] = useState<TResult | null>(null);

  const runner = useWebGpuProgram<TProgram>(() => {
    const canvas = withCanvas ? canvasRef.current : null;
    if (withCanvas && !canvas) {
      throw new Error('The WebGPU canvas is not ready yet.');
    }
    return createProgram({ canvas });
  });

  async function handleRun() {
    await runner.runExclusive(async (program) => {
      if (captureConsole) {
        await consoleCapture.captureDuring(async () => {
          setLastResult(await run(program));
          // GPU-side console.log fires after submitted work completes; wait
          // before tearing down the capture so shader logs are recorded.
          await waitForGpuLogs(program.root);
        });
      } else {
        setLastResult(await run(program));
      }
    });
  }

  const canvasNode = withCanvas ? (
    <canvas
      aria-label={withCanvas.ariaLabel}
      className="block aspect-square w-full rounded-sm border border-[var(--sl-color-gray-5)] bg-[#171526]"
      height={DEFAULT_CANVAS_SIZE}
      ref={canvasRef}
      width={DEFAULT_CANVAS_SIZE}
    />
  ) : null;

  const state: RunnableSnippetState<TProgram, TResult> = {
    canvas: canvasNode,
    lastResult,
    output: consoleCapture.output,
    runner,
  };

  return (
    <RunnableSnippetShell
      compactPreview={captureConsole && !controls && !withCanvas}
      controls={controls?.(state)}
      onRun={() => void handleRun()}
      preview={preview(state)}
      runner={runner}
      scrollCode={withCanvas !== undefined}
    >
      {children}
    </RunnableSnippetShell>
  );
}
