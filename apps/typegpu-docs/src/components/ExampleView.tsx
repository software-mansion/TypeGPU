import cs from 'classnames';
import { useAtomValue, useSetAtom } from 'jotai';
import { type RefObject, useEffect, useRef, useState } from 'react';
import {
  codeEditorShownAtom,
  codeEditorShownMobileAtom,
} from '../utils/examples/codeEditorShownAtom';
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
  exampleCode: string,
  htmlCode: string,
  setSnackbarText: (text: string | undefined) => void,
  tags?: string[],
) {
  const exampleRef = useRef<ExampleState | null>(null);
  const setExampleControlParams = useSetAtom(exampleControlsAtom);

  // biome-ignore lint/correctness/useExhaustiveDependencies: reload example on html change
  useEffect(() => {
    let cancelled = false;
    setSnackbarText(undefined);

    executeExample(exampleCode, tags)
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
          console.log(err);
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
  }, [exampleCode, htmlCode, setSnackbarText, setExampleControlParams, tags]);
}

type EditorTab = 'ts' | 'html';

export function ExampleView({ example }: Props) {
  const { tsCode, htmlCode, metadata, execTsCode } = example;

  const [snackbarText, setSnackbarText] = useState<string | undefined>();
  const [currentEditorTab, setCurrentEditorTab] = useState<EditorTab>('ts');

  const codeEditorShowing = useAtomValue(codeEditorShownAtom);
  const codeEditorMobileShowing = useAtomValue(codeEditorShownMobileAtom);

  const exampleHtmlRef = useRef<HTMLDivElement>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: reset embedded html on code change
  useEffect(() => {
    if (!exampleHtmlRef.current) {
      return;
    }
    exampleHtmlRef.current.innerHTML = htmlCode;
  }, [tsCode, htmlCode]);

  useExample(execTsCode, htmlCode, setSnackbarText, metadata.tags);
  useResizableCanvas(exampleHtmlRef, tsCode, htmlCode);

  return (
    <>
      {snackbarText && isGPUSupported ? <Snackbar text={snackbarText} /> : null}

      <div className="flex flex-col md:grid gap-4 md:grid-cols-[1fr_18.75rem] h-full">
        <div
          className={cs(
            'flex-1 grid gap-4',
            codeEditorShowing ? 'md:grid-rows-2' : '',
          )}>
          {isGPUSupported ? (
            <div
              style={{
                scrollbarGutter: 'stable',
              }}
              className={cs(
                'flex justify-evenly items-center flex-wrap overflow-auto h-full box-border flex-col md:flex-row md:gap-4',
                codeEditorShowing ? 'md:max-h-[calc(50vh-3rem)]' : '',
              )}>
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
              )}>
              <div className="absolute inset-0">
                <EditorTabButtonPanel
                  currentEditorTab={currentEditorTab}
                  setCurrentEditorTab={setCurrentEditorTab}
                />

                <TsCodeEditor shown={currentEditorTab === 'ts'} code={tsCode} />

                <HtmlCodeEditor
                  shown={currentEditorTab === 'html'}
                  code={htmlCode}
                />
              </div>
            </div>
          ) : null}
        </div>
        <ControlPanel />
      </div>
    </>
  );
}

function EditorTabButtonPanel({
  currentEditorTab,
  setCurrentEditorTab,
}: {
  currentEditorTab: EditorTab;
  setCurrentEditorTab: (tab: EditorTab) => void;
}) {
  const commonStyle =
    'inline-flex justify-center items-center box-border text-sm px-5 py-1';
  const activeStyle =
    'bg-gradient-to-br from-gradient-purple to-gradient-blue text-white hover:from-gradient-purple-dark hover:to-gradient-blue-dark';
  const inactiveStyle =
    'bg-white border-tameplum-100 border-2 hover:bg-tameplum-20';

  return (
    <div className="absolute right-0 md:right-6 top-2 z-10 flex">
      <button
        className={cs(
          commonStyle,
          'rounded-l-lg',
          currentEditorTab === 'ts' ? activeStyle : inactiveStyle,
        )}
        type="button"
        onClick={() => setCurrentEditorTab('ts')}>
        TS
      </button>
      <button
        className={cs(
          commonStyle,
          'rounded-r-lg',
          currentEditorTab === 'html' ? activeStyle : inactiveStyle,
        )}
        type="button"
        onClick={() => setCurrentEditorTab('html')}>
        HTML
      </button>
    </div>
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
        className="text-transparent underline bg-gradient-to-r from-gradient-purple-dark to-gradient-blue-dark bg-clip-text">
        Read more about the availability
      </a>
    </div>
  );
}

function useResizableCanvas(
  exampleHtmlRef: RefObject<HTMLDivElement>,
  tsCode: string,
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

      const aspectRatio = canvas.dataset.aspectRatio ?? '1';

      container.className =
        'flex flex-1 justify-center items-center w-full md:h-full md:w-auto';
      container.style.containerType = 'size';

      frame.className = 'relative';
      frame.style.aspectRatio = aspectRatio;
      frame.style.height = `min(calc(min(100cqw, 100cqh)/(${aspectRatio})), min(100cqw, 100cqh))`;

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
  }, [exampleHtmlRef, tsCode, htmlCode]);
}
