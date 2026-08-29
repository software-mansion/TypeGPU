import cs from 'classnames';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import {
  type RefObject,
  Suspense,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  lazy,
} from 'react';
import { currentSnackbarAtom } from '../utils/examples/currentSnackbarAtom.ts';
import { tsoverUsedAtom, exampleFullscreenAtom } from '../utils/examples/exampleViewStateAtoms.ts';
import { ExecutionCancelledError } from '../utils/examples/errors.ts';
import { exampleControlsAtom } from '../utils/examples/exampleControlAtom.ts';
import { executeExample } from '../utils/examples/exampleRunner.ts';
import type { ExampleState } from '../utils/examples/exampleState.ts';
import {
  type Example,
  type ExampleCommonFile,
  type ExampleSrcFile,
} from '../utils/examples/types.ts';
import { isGPUSupported } from '../utils/isGPUSupported.ts';
import { ControlPanel } from './ControlPanel.tsx';
import { Button } from './design/Button.tsx';
import { Snackbar } from './design/Snackbar.tsx';
import { ExamplePreviewLoading } from './ExamplePreviewLoading.tsx';
import { StackBlitzButton } from './ExampleStaticButtons.tsx';
import { openInStackBlitz } from './stackblitz/openInStackBlitz.ts';
import { TsoverSwitch } from './design/TsoverSwitch.tsx';

type Props = {
  example: Example;
  common: ExampleCommonFile[];
  isPlayground?: boolean;
};

// Lazy-loading the CodeEditor component, as the Monaco editor is quite heavy
const CodeEditor = lazy(() => import('./CodeEditor.tsx'));

function useExample(
  tsImport: () => Promise<unknown>,
  setSnackbarText: (text: string | undefined) => void,
) {
  const exampleRef = useRef<ExampleState | null>(null);
  const setExampleControlParams = useSetAtom(exampleControlsAtom);
  const [isLoading, setIsLoading] = useState(true);

  useLayoutEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setSnackbarText(undefined);
    setExampleControlParams([]);

    executeExample(tsImport)
      .then((example) => {
        if (cancelled) {
          // Another instance was started in the meantime.
          example.dispose();
          return;
        }
        // Success
        setExampleControlParams(example.controlParams);
        exampleRef.current = example;
        setIsLoading(false);
      })
      .catch((err) => {
        if (cancelled || err instanceof ExecutionCancelledError) {
          return;
        }

        setIsLoading(false);
        if (err instanceof SyntaxError) {
          setSnackbarText(`${err.name}: ${err.message}`);
          console.error(err);
        } else {
          setSnackbarText(`${err.name}: ${err.message}`);
          console.error(err);
        }
      });

    return () => {
      exampleRef.current?.dispose();
      cancelled = true;
    };
  }, [setSnackbarText, setExampleControlParams]);

  return isLoading;
}

export function ExampleView({ example, common }: Props) {
  const { tsImport, sourceAtom } = example;

  const exampleSource = useAtomValue(sourceAtom);

  const tsFiles = filterRelevantTsFiles(exampleSource.tsFiles, common);
  const filePaths = tsFiles.map((file) => file.path);
  const entryFile = filePaths.find((path) => path.startsWith('index.ts')) as string;
  const editorTabsList = [
    entryFile,
    ...filePaths.filter((name) => name !== entryFile),
    'index.html',
  ];

  const [snackbarText, setSnackbarText] = useAtom(currentSnackbarAtom);
  const [currentFilePath, setCurrentFilePath] = useState(entryFile);

  const [fullscreen, setFullscreen] = useAtom(exampleFullscreenAtom);
  const [controlsVisible, setControlsVisible] = useState(true);
  const tsoverUsed = useAtomValue(tsoverUsedAtom);
  const exampleHtmlRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!exampleHtmlRef.current) {
      return;
    }
    exampleHtmlRef.current.innerHTML = exampleSource.htmlFile.content;
  }, [exampleSource]);

  useEffect(() => {
    if (!fullscreen) {
      return;
    }
    const listener = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setFullscreen(false);
      }
    };
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, [fullscreen, setFullscreen]);

  const isLoading = useExample(tsImport, setSnackbarText);
  useResizableCanvas(exampleHtmlRef);

  return (
    <>
      {snackbarText && isGPUSupported && <Snackbar text={snackbarText} />}

      <div
        className={cs(
          '@container/example-preview',
          fullscreen ? 'relative flex h-full w-full gap-4' : 'flex flex-col gap-4',
        )}
      >
        <div
          className={cs(
            fullscreen
              ? 'relative h-full w-full'
              : 'flex flex-col gap-4 @3xl/example-preview:h-[calc(100cqw_-_19rem)] @3xl/example-preview:flex-row',
          )}
        >
          <div
            style={{ scrollbarGutter: 'stable both-edges' }}
            className={cs(
              'relative box-border flex items-center justify-center overflow-hidden bg-white dark:bg-[#171a25]',
              fullscreen
                ? 'h-full w-full'
                : 'aspect-square w-full flex-1 overflow-hidden border border-tameplum-100 dark:border-white/10',
            )}
          >
            {isGPUSupported ? (
              <div ref={exampleHtmlRef} className="contents" />
            ) : (
              <GPUUnsupportedPanel />
            )}
            {isLoading && <ExamplePreviewLoading />}
          </div>

          <div
            className={cs(
              'flex shrink-0 flex-col gap-2',
              fullscreen
                ? 'absolute right-4 bottom-4 z-20 max-h-[calc(100dvh-2rem)] w-96 max-w-[calc(100%-2rem)]'
                : 'w-full @3xl/example-preview:h-full @3xl/example-preview:w-72',
              fullscreen && !controlsVisible && 'hidden',
            )}
          >
            <ControlPanel
              fullscreen={fullscreen}
              onFullscreenToggle={() => setFullscreen((prev) => !prev)}
              onHide={fullscreen ? () => setControlsVisible(false) : undefined}
            />
          </div>

          {fullscreen && !controlsVisible && (
            <div className="absolute right-4 bottom-4 z-20">
              <Button onClick={() => setControlsVisible(true)}>Show controls</Button>
            </div>
          )}
        </div>

        {!fullscreen && (
          <div className="grid gap-4 pt-4 pb-8 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
            <div className="flex min-w-0 flex-col gap-4">
              <div className="flex min-w-0 items-center gap-2">
                <div className="min-w-0">
                  <h1 className="text-navy-100 dark:text-almost-white m-0 truncate text-3xl font-semibold sm:text-4xl">
                    {example.metadata.title}
                  </h1>
                </div>
                {example.metadata.dev && (
                  <span className="shrink-0 rounded-sm bg-red-600 px-2 py-0.5 text-[10px] font-semibold text-white">
                    Dev
                  </span>
                )}
              </div>

              <p className="text-tameplum-800 dark:text-gray-300 text-sm leading-relaxed sm:text-base">
                Description placeholder
              </p>

              <div className="flex flex-wrap gap-2">
                {(example.metadata.tags ?? []).map((tag) => (
                  <span
                    key={tag}
                    className="bg-tameplum-50 text-tameplum-800 dark:bg-white/6 dark:text-gray-300 rounded-sm px-3 py-1 text-xs"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>

            <div className="flex shrink-0 flex-col gap-2">
              <StackBlitzButton onClick={() => openInStackBlitz(example, exampleSource, common)} />
            </div>
          </div>
        )}

        {!fullscreen && (
          <div className="border-tameplum-100 dark:border-white/10 relative overflow-hidden border">
            <div className="border-tameplum-100 bg-tameplum-100 dark:border-white/10 dark:bg-[#1b1f2c] flex h-10 items-stretch border-b">
              <TabList
                editorTabsList={editorTabsList}
                currentFilePath={currentFilePath}
                onSelect={setCurrentFilePath}
              />
              <div className="shrink-0 border-l border-tameplum-100 dark:border-white/10">
                <TsoverSwitch />
              </div>
            </div>

            <Suspense
              fallback={
                <div className="dark:bg-[#171a25] flex h-[32rem] items-center justify-center bg-white">
                  <div className="flex items-center gap-3 text-sm text-tameplum-600 dark:text-gray-300">
                    <span className="size-4 animate-spin rounded-full border-2 border-accent-600/25 border-t-accent-600" />
                    Loading code editor
                  </div>
                </div>
              }
            >
              <CodeEditor
                shown={currentFilePath === 'index.html'}
                file={exampleSource.htmlFile}
                language={'html'}
                tsoverEnabled={false}
              />

              {tsFiles.map((file) => (
                <CodeEditor
                  key={file.path}
                  shown={file.path === currentFilePath}
                  language={'typescript'}
                  tsoverEnabled={tsoverUsed}
                  file={file}
                />
              ))}
            </Suspense>
          </div>
        )}
      </div>
    </>
  );
}

function TabList({
  editorTabsList,
  currentFilePath,
  onSelect,
}: {
  editorTabsList: string[];
  currentFilePath: string;
  onSelect: (path: string) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollRight, setCanScrollRight] = useState(false);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) {
      return;
    }
    const update = () => {
      setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
    };
    update();
    el.addEventListener('scroll', update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => {
      el.removeEventListener('scroll', update);
      observer.disconnect();
    };
  }, []);

  return (
    <div className="relative min-w-0 flex-1">
      <div ref={scrollRef} className="flex h-full overflow-x-auto">
        {editorTabsList.map((fileName) => (
          <button
            key={fileName}
            type="button"
            onClick={() => onSelect(fileName)}
            className={cs(
              'shrink-0 h-full border-b-2 px-4 pt-0.5 text-sm font-medium transition-colors',
              currentFilePath === fileName
                ? 'border-accent-600 bg-white text-navy-100 shadow-sm dark:bg-[#272b3c] dark:text-white'
                : 'border-transparent bg-tameplum-100 text-tameplum-600 hover:text-navy-80 dark:bg-[#1b1f2c] dark:text-gray-400 dark:hover:text-white',
            )}
          >
            {fileName}
          </button>
        ))}
      </div>
      <div
        className={`pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-tameplum-100 to-transparent transition-opacity duration-150 dark:from-[#1b1f2c] ${
          canScrollRight ? 'opacity-100' : 'opacity-0'
        }`}
      />
    </div>
  );
}

function GPUUnsupportedPanel() {
  return (
    <div className="grid place-content-center gap-6 text-center text-xl leading-tight">
      <div className="text-3xl">WebGPU is not enabled/supported in this browser 😔</div>
      <div>Maybe it's hidden under an experimental flag? 🤔</div>

      <a
        href="/TypeGPU/blog/troubleshooting"
        className="bg-gradient-to-r from-gradient-purple to-gradient-blue bg-clip-text text-transparent underline"
      >
        Read more about the availability
      </a>
    </div>
  );
}

function useResizableCanvas(exampleHtmlRef: RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const canvases = exampleHtmlRef.current?.querySelectorAll('canvas') as
      | HTMLCanvasElement[]
      | undefined;
    const observers: ResizeObserver[] = [];

    for (const canvas of canvases ?? []) {
      if ('width' in canvas.attributes || 'height' in canvas.attributes) {
        continue;
      }

      const newCanvas = document.createElement('canvas');
      const container = document.createElement('div');
      const frame = document.createElement('div');

      frame.appendChild(newCanvas);
      container.appendChild(frame);

      container.className = 'flex flex-1 justify-center items-center w-full h-full md:w-auto';
      container.style.containerType = 'size';

      frame.className = 'relative';

      if (canvas.dataset.fitToContainer !== undefined) {
        frame.style.width = '100%';
        frame.style.height = '100%';
      } else {
        const aspectRatio = canvas.dataset.aspectRatio ?? '1';
        frame.style.aspectRatio = aspectRatio;
        frame.style.height = `min(100cqh, calc(100cqw/(${aspectRatio})))`;
      }

      for (const prop of canvas.style) {
        // @ts-expect-error
        newCanvas.style[prop] = canvas.style[prop];
      }
      for (const attribute of canvas.attributes) {
        // @ts-expect-error
        newCanvas[attribute.name] = attribute.value;
      }
      newCanvas.className = 'absolute w-full h-full';

      canvas.parentElement?.replaceChild(container, canvas);

      const onResize: ResizeObserverCallback = ([entry]) => {
        if (!entry) {
          return;
        }

        // Despite what the types say this property does not exist in Safari (hence the optional chaining).
        const dpcb = entry.devicePixelContentBoxSize?.[0] as ResizeObserverSize | undefined;

        const dpr = dpcb ? 1 : window.devicePixelRatio || 1;
        const box =
          dpcb ??
          (Array.isArray(entry.contentBoxSize) ? entry.contentBoxSize[0] : entry.contentBoxSize);

        if (!box) {
          return;
        }

        newCanvas.width = Math.round(box.inlineSize * dpr);
        newCanvas.height = Math.round(box.blockSize * dpr);
      };

      const observer = new ResizeObserver(onResize);
      observer.observe(newCanvas);
      observers.push(observer);
    }

    return () => {
      for (const observer of observers) {
        observer.disconnect();
      }
    };
  }, [exampleHtmlRef]);
}

/**
 * NOTE: this function only filters common files used in src files.
 * Common files used in other common files will not be included.
 */
function filterRelevantTsFiles(srcFiles: ExampleSrcFile[], commonFiles: ExampleCommonFile[]) {
  const tsFiles: (ExampleSrcFile | ExampleCommonFile)[] = [...srcFiles];

  for (const common of commonFiles) {
    for (const src of srcFiles) {
      if (src.content.includes(`common/${common.path}`)) {
        tsFiles.push(common);
        break;
      }
    }
  }

  return tsFiles;
}
