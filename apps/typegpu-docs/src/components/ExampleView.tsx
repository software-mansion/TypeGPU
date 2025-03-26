import cs from 'classnames';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { type RefObject, useEffect, useRef, useState } from 'react';
import {
  codeEditorShownAtom,
  codeEditorShownMobileAtom,
} from '../utils/examples/codeEditorShownAtom';
import { currentSnackbarAtom } from '../utils/examples/currentSnackbarAtom';
import { ExecutionCancelledError } from '../utils/examples/errors';
import { exampleControlsAtom } from '../utils/examples/exampleControlAtom';
import { executeExample } from '../utils/examples/exampleRunner';
import type { ExampleState } from '../utils/examples/exampleState';
import type { Example } from '../utils/examples/types';
import { isGPUSupported } from '../utils/isGPUSupported';
import { HtmlCodeEditor, TsCodeEditor } from './CodeEditor';
import { ControlPanel } from './ControlPanel';
import { Snackbar } from './design/Snackbar';

type Props = {
  example: Example;
  isPlayground?: boolean;
};

function useExample(
  tsImport: () => Promise<unknown>,
  htmlCode: string,
  setSnackbarText: (text: string | undefined) => void,
) {
  const exampleRef = useRef<ExampleState | null>(null);
  const setExampleControlParams = useSetAtom(exampleControlsAtom);

  // biome-ignore lint/correctness/useExhaustiveDependencies: reload example on html change
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
  }, [htmlCode, setSnackbarText, setExampleControlParams]);
}

export function ExampleView({ example }: Props) {
  const { tsCodes, tsImport, htmlCode } = example;

  const [snackbarText, setSnackbarText] = useAtom(currentSnackbarAtom);
  const [currentFile, setCurrentFile] = useState<string>('index.ts');

  const codeEditorShowing = useAtomValue(codeEditorShownAtom);
  const codeEditorMobileShowing = useAtomValue(codeEditorShownMobileAtom);
  const exampleHtmlRef = useRef<HTMLDivElement>(null);

  const codeFiles = Object.keys(tsCodes);
  const editorTabsList = [
    'index.ts',
    ...codeFiles.filter((name) => name !== 'index.ts'),
    'index.html',
  ];

  useEffect(() => {
    if (!exampleHtmlRef.current) {
      return;
    }
    exampleHtmlRef.current.innerHTML = htmlCode;
  }, [htmlCode]);

  useExample(tsImport, htmlCode, setSnackbarText); // live example
  useResizableCanvas(exampleHtmlRef, htmlCode);

  return (
    <>
      {snackbarText && isGPUSupported ? <Snackbar text={snackbarText} /> : null}

      <div className="flex flex-col md:grid gap-4 md:grid-cols-[1fr_18.75rem] h-full">
        <div
          className={cs(
            'flex-1 grid gap-4',
            codeEditorShowing ? 'md:grid-rows-[2fr_3fr]' : '',
          )}
        >
          {isGPUSupported ? (
            <div
              style={{
                scrollbarGutter: 'stable both-edges',
              }}
              className={cs(
                'flex justify-evenly items-center flex-wrap h-full box-border flex-col md:flex-row md:gap-4',
                codeEditorShowing
                  ? 'md:max-h-[calc(50vh-3rem)] md:overflow-auto'
                  : '',
              )}
            >
              <div ref={exampleHtmlRef} className="contents w-full h-full" />
            </div>
          ) : (
            <GPUUnsupportedPanel />
          )}

          {codeEditorShowing || codeEditorMobileShowing ? (
            <div
              className={cs(
                codeEditorShowing && !codeEditorMobileShowing
                  ? 'hidden md:block'
                  : '',
                !codeEditorShowing && codeEditorMobileShowing
                  ? 'md:hidden'
                  : '',
                'absolute bg-tameplum-50 z-20 md:relative h-[calc(100%-2rem)] w-[calc(100%-2rem)] md:w-full md:h-full',
              )}
            >
              <div className="absolute inset-0 flex flex-col justify-between">
                <div className="h-12 pt-16 md:pt-0">
                  <div className="flex overflow-x-auto border-gray-300 h-full">
                    {editorTabsList.map((fileName) => (
                      <button
                        key={fileName}
                        type="button"
                        onClick={() => setCurrentFile(fileName)}
                        className={cs(
                          'px-4 rounded-t-lg rounded-b-none text-nowrap',
                          currentFile === fileName
                            ? 'bg-gradient-to-br from-gradient-purple to-gradient-blue text-white hover:from-gradient-purple-dark hover:to-gradient-blue-dark'
                            : 'bg-white border-tameplum-100 border-2 hover:bg-tameplum-20',
                        )}
                      >
                        {fileName}
                      </button>
                    ))}
                  </div>
                </div>

                <HtmlCodeEditor
                  shown={currentFile === 'index.html'}
                  code={htmlCode}
                />

                {Object.entries(tsCodes).map(([key, value]) => (
                  <TsCodeEditor
                    shown={key === currentFile}
                    code={value}
                    key={key}
                  />
                ))}
              </div>
            </div>
          ) : null}
        </div>
        <ControlPanel />
      </div>
    </>
  );
}

function GPUUnsupportedPanel() {
  return (
    <div className="grid gap-6 text-xl leading-tight text-center place-content-center">
      <div className="text-3xl">
        WebGPU is not enabled/supported in this browser 😔
      </div>
      <div>Maybe it's hidden under an experimental flag? 🤔</div>

      <a
        href="/TypeGPU/blog/troubleshooting"
        className="text-transparent underline bg-gradient-to-r from-gradient-purple-dark to-gradient-blue-dark bg-clip-text"
      >
        Read more about the availability
      </a>
    </div>
  );
}

function useResizableCanvas(
  exampleHtmlRef: RefObject<HTMLDivElement | null>,
  htmlCode: string,
) {
  // biome-ignore lint/correctness/useExhaustiveDependencies: should be run on every htmlCode and tsCode change
  useEffect(() => {
    const canvases = exampleHtmlRef.current?.querySelectorAll('canvas') as
      | HTMLCanvasElement[]
      | undefined;
    const observers: ResizeObserver[] = [];

    for (const canvas of canvases ?? []) {
      if ('width' in canvas.attributes || 'height' in canvas.attributes) {
        continue; // custom canvas, not replacing with resizable
      }

      const newCanvas = document.createElement('canvas');
      const container = document.createElement('div');
      const frame = document.createElement('div');

      frame.appendChild(newCanvas);
      container.appendChild(frame);

      container.className =
        'flex flex-1 justify-center items-center w-full md:h-full md:w-auto';
      container.style.containerType = 'size';

      frame.className = 'relative';

      if (canvas.dataset.fitToContainer !== undefined) {
        frame.style.width = '100%';
        frame.style.height = '100%';
      } else {
        const aspectRatio = canvas.dataset.aspectRatio ?? '1';
        frame.style.aspectRatio = aspectRatio;
        frame.style.height = `min(calc(min(100cqw, 100cqh)/(${aspectRatio})), min(100cqw, 100cqh))`;
      }

      for (const prop of canvas.style) {
        // @ts-ignore
        newCanvas.style[prop] = canvas.style[prop];
      }
      for (const attribute of canvas.attributes) {
        // @ts-ignore
        newCanvas[attribute.name] = attribute.value;
      }
      newCanvas.className = 'absolute w-full h-full';

      canvas.parentElement?.replaceChild(container, canvas);

      const onResize = () => {
        newCanvas.width = frame.clientWidth * window.devicePixelRatio;
        newCanvas.height = frame.clientHeight * window.devicePixelRatio;
      };

      onResize();

      const observer = new ResizeObserver(onResize);
      observer.observe(container);
      observers.push(observer);
    }

    return () => {
      for (const observer of observers) {
        observer.disconnect();
      }
    };
  }, [exampleHtmlRef, htmlCode]);
}
