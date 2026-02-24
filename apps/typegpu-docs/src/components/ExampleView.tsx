import cs from 'classnames';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { type RefObject, useEffect, useRef, useState } from 'react';
import { currentSnackbarAtom } from '../utils/examples/currentSnackbarAtom.ts';
import { codeEditorShownAtom } from '../utils/examples/exampleViewStateAtoms.ts';
import { ExecutionCancelledError } from '../utils/examples/errors.ts';
import { exampleControlsAtom } from '../utils/examples/exampleControlAtom.ts';
import { executeExample } from '../utils/examples/exampleRunner.ts';
import type { ExampleState } from '../utils/examples/exampleState.ts';
import type {
  Example,
  ExampleCommonFile,
  ExampleSrcFile,
} from '../utils/examples/types.ts';
import { isGPUSupported } from '../utils/isGPUSupported.ts';
import { HtmlCodeEditor, TsCodeEditor } from './CodeEditor.tsx';
import { ControlPanel } from './ControlPanel.tsx';
import { Button } from './design/Button.tsx';
import { Snackbar } from './design/Snackbar.tsx';
import { openInStackBlitz } from './stackblitz/openInStackBlitz.ts';

type Props = {
  example: Example;
  common: ExampleCommonFile[];
  isPlayground?: boolean;
};

function useExample(
  tsImport: () => Promise<unknown>,
  setSnackbarText: (text: string | undefined) => void,
) {
  const exampleRef = useRef<ExampleState | null>(null);
  const setExampleControlParams = useSetAtom(exampleControlsAtom);

  useEffect(() => {
    let cancelled = false;
    setSnackbarText(undefined);

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
      })
      .catch((err) => {
        if (err instanceof SyntaxError) {
          setSnackbarText(`${err.name}: ${err.message}`);
          console.error(err);
        } else if (err instanceof ExecutionCancelledError) {
          // Ignore, to be expected.
          cancelled = true;
        } else {
          setSnackbarText(`${err.name}: ${err.message}`);
          throw err;
        }
      });

    return () => {
      exampleRef.current?.dispose();
      cancelled = true;
    };
  }, [setSnackbarText, setExampleControlParams]);
}

export function ExampleView({ example, common }: Props) {
  const { tsFiles: srcFiles, tsImport, htmlFile } = example;

  const [snackbarText, setSnackbarText] = useAtom(currentSnackbarAtom);
  const [currentFilePath, setCurrentFilePath] = useState<string>('index.ts');

  const codeEditorShown = useAtomValue(codeEditorShownAtom);
  const exampleHtmlRef = useRef<HTMLDivElement>(null);

  const tsFiles = filterRelevantTsFiles(srcFiles, common);
  const filePaths = tsFiles.map((file) => file.path);
  const editorTabsList = [
    'index.ts',
    ...filePaths.filter((name) => name !== 'index.ts'),
    'index.html',
  ];

  useEffect(() => {
    if (!exampleHtmlRef.current) {
      return;
    }
    exampleHtmlRef.current.innerHTML = htmlFile.content;
  }, [htmlFile]);

  useExample(tsImport, setSnackbarText);
  useResizableCanvas(exampleHtmlRef);

  return (
    <>
      {snackbarText && isGPUSupported && <Snackbar text={snackbarText} />}

      <div className='flex h-full flex-col gap-4 md:grid md:grid-cols-[1fr_18.75rem]'>
        <div
          className={cs(
            'grid flex-1 gap-4 overflow-auto',
            codeEditorShown ? 'md:grid-rows-[2fr_3fr]' : '',
          )}
        >
          {isGPUSupported
            ? (
              <div
                style={{ scrollbarGutter: 'stable both-edges' }}
                className={cs(
                  'relative box-border flex h-full flex-col flex-wrap items-center justify-evenly gap-4 overflow-auto md:flex-row',
                  codeEditorShown
                    ? 'max-md:hidden md:max-h-[calc(40vh-1.25rem)] md:overflow-auto'
                    : '',
                )}
              >
                <div ref={exampleHtmlRef} className='contents' />
              </div>
            )
            : <GPUUnsupportedPanel />}

          {codeEditorShown && (
            <div className='absolute z-20 h-[calc(100%-2rem)] w-[calc(100%-2rem)] bg-tameplum-50 md:relative md:h-full md:w-full'>
              <div className='absolute inset-0 flex flex-col justify-between'>
                <div className='h-12 pt-16 md:pt-0'>
                  <div className='flex h-full overflow-x-auto border-gray-300'>
                    {editorTabsList.map((fileName) => (
                      <button
                        key={fileName}
                        type='button'
                        onClick={() => setCurrentFilePath(fileName)}
                        className={cs(
                          'text-nowrap rounded-t-lg rounded-b-none px-4 text-sm',
                          currentFilePath === fileName
                            ? 'bg-gradient-to-br from-gradient-purple to-gradient-blue text-white hover:from-gradient-purple-dark hover:to-gradient-blue-dark'
                            : 'border-2 border-tameplum-100 bg-white hover:bg-tameplum-20',
                        )}
                      >
                        {fileName}
                      </button>
                    ))}
                  </div>
                </div>

                <HtmlCodeEditor
                  shown={currentFilePath === 'index.html'}
                  file={htmlFile}
                />

                {tsFiles.map((file) => (
                  <TsCodeEditor
                    key={file.path}
                    shown={file.path === currentFilePath}
                    file={file}
                  />
                ))}
              </div>

              <div className='absolute right-0 z-5 md:top-15 md:right-8'>
                <Button onClick={() => openInStackBlitz(example, common)}>
                  <span className='font-bold'>Edit on</span>
                  <img
                    src='https://developer.stackblitz.com/img/logo/stackblitz-logo-black_blue.svg'
                    alt='stackblitz logo'
                    className='h-4'
                  />
                </Button>
              </div>
            </div>
          )}
        </div>
        <ControlPanel />
      </div>
    </>
  );
}

function GPUUnsupportedPanel() {
  return (
    <div className='grid place-content-center gap-6 text-center text-xl leading-tight'>
      <div className='text-3xl'>
        WebGPU is not enabled/supported in this browser 😔
      </div>
      <div>Maybe it's hidden under an experimental flag? 🤔</div>

      <a
        href='/TypeGPU/blog/troubleshooting'
        className='bg-gradient-to-r from-purple-500 to-blue-500 bg-clip-text text-transparent underline'
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

      container.className =
        'flex flex-1 justify-center items-center w-full h-full md:w-auto';
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
        const dpcb = entry.devicePixelContentBoxSize?.[0] as
          | ResizeObserverSize
          | undefined;

        const dpr = dpcb ? 1 : window.devicePixelRatio || 1;
        const box = dpcb ??
          (Array.isArray(entry.contentBoxSize)
            ? entry.contentBoxSize[0]
            : entry.contentBoxSize);

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
function filterRelevantTsFiles(
  srcFiles: ExampleSrcFile[],
  commonFiles: ExampleCommonFile[],
) {
  const tsFiles: (ExampleSrcFile | ExampleCommonFile)[] = [
    ...srcFiles,
  ];

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
