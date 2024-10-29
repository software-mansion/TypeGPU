import cs from 'classnames';
import { useAtomValue, useSetAtom } from 'jotai';
import { compressToEncodedURIComponent } from 'lz-string';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { debounce } from 'remeda';
import {
  codeEditorShownAtom,
  codeEditorShownMobileAtom,
} from '../utils/examples/codeEditorShownAtom';
import { currentExampleAtom } from '../utils/examples/currentExampleAtom';
import { ExecutionCancelledError } from '../utils/examples/errors';
import { PLAYGROUND_KEY } from '../utils/examples/exampleContent';
import { exampleControlsAtom } from '../utils/examples/exampleControlAtom';
import { executeExample } from '../utils/examples/exampleRunner';
import type { ExampleState } from '../utils/examples/exampleState';
import type { Example } from '../utils/examples/types';
import { isGPUSupported } from '../utils/isGPUSupported';
import useEvent from '../utils/useEvent';
import { CodeEditor, HtmlCodeEditor } from './CodeEditor';
import { ControlPanel } from './ControlPanel';
import { Button } from './design/Button';
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

export function ExampleView({ example, isPlayground = false }: Props) {
  const {
    tsCode: initialTsCode,
    htmlCode: intitialHtmlCode,
    metadata,
  } = example;
  const [code, setCode] = useState(initialTsCode);
  const [htmlCode, setHtmlCode] = useState(intitialHtmlCode);
  const [snackbarText, setSnackbarText] = useState<string | undefined>();
  const setCurrentExample = useSetAtom(currentExampleAtom);
  const codeEditorShowing = useAtomValue(codeEditorShownAtom);
  const codeEditorMobileShowing = useAtomValue(codeEditorShownMobileAtom);
  const [currentEditorTab, setCurrentEditorTab] = useState<'ts' | 'html'>('ts');

  const setCodeWrapper = isPlayground
    ? useCallback(
        (code: string) => {
          const encoded = compressToEncodedURIComponent(code);
          setCurrentExample(`${PLAYGROUND_KEY}${encoded}`);
          localStorage.setItem(PLAYGROUND_KEY, encoded);
          setCode(code);
        },
        [setCurrentExample],
      )
    : setCode;

  useEffect(() => {
    setCodeWrapper(initialTsCode);
    setHtmlCode(intitialHtmlCode);
  }, [initialTsCode, setCodeWrapper, intitialHtmlCode]);

  const setCodeDebouncer = useMemo(
    () => debounce(setCodeWrapper, { waitMs: 500 }),
    [setCodeWrapper],
  );

  const handleCodeChange = useEvent((newCode: string) => {
    setCodeDebouncer.call(newCode);
  });

  useExample(code, htmlCode, setSnackbarText, metadata.tags);

  const exampleHtmlRef = useRef<HTMLDivElement>(null);
  const listeners: (() => void)[] = [];

  // biome-ignore lint/correctness/useExhaustiveDependencies: must be run on html code change
  useEffect(() => {
    const canvases = exampleHtmlRef.current?.querySelectorAll('canvas') as
      | HTMLCanvasElement[]
      | undefined;

    for (const canvas of canvases ?? []) {
      const newCanvas = document.createElement('canvas');

      if (
        canvas.width !== newCanvas.width ||
        canvas.height !== newCanvas.height
      ) {
        continue;
      }

      const container = document.createElement('div');
      const frame = document.createElement('div');
      const parent = canvas.parentElement;

      frame.appendChild(newCanvas);
      container.appendChild(frame);

      const aspectRatio = canvas.dataset.aspectRatio ?? '1';

      container.style.containerType = 'size';
      container.style.flex = '0 1 auto';
      container.style.display = 'flex';
      container.style.justifyContent = 'center';
      container.style.flexDirection = 'column';
      container.style.alignItems = 'center';
      container.style.width = '100%';
      container.style.height = '100%';

      frame.style.position = 'relative';
      frame.style.aspectRatio = aspectRatio;
      frame.style.height = 'min(100cqw, 100cqh)';

      newCanvas.style.position = 'absolute';
      newCanvas.style.width = '100%';
      newCanvas.style.height = '100%';

      parent?.appendChild(container);
      parent?.removeChild(canvas);

      const onResize = () => {
        newCanvas.width = frame.clientWidth * window.devicePixelRatio;
        newCanvas.height = frame.clientHeight * window.devicePixelRatio;
      };

      window.addEventListener('resize', onResize);
      listeners.push(onResize);
      onResize();
    }

    return () => {
      for (const listener of listeners) {
        window.removeEventListener('resize', listener);
      }
    };
  }, [htmlCode]);

  return (
    <>
      {snackbarText && isGPUSupported ? <Snackbar text={snackbarText} /> : null}

      <div className="flex flex-col md:grid gap-4 md:grid-cols-[1fr_18.75rem] h-full">
        <div
          className={cs(
            'flex-1 grid gap-4',
            codeEditorShowing ? 'md:grid-rows-2' : '',
          )}
        >
          {isGPUSupported ? (
            <div
              style={{
                scrollbarGutter: 'stable',
              }}
              className={cs(
                'flex justify-evenly items-center flex-wrap overflow-auto h-full box-border',
                codeEditorShowing ? 'md:max-h-[calc(50vh-3rem)]' : '',
              )}
            >
              <div
                ref={exampleHtmlRef}
                className="contents w-full h-full"
                // biome-ignore lint/security/noDangerouslySetInnerHtml: must be done
                dangerouslySetInnerHTML={{ __html: htmlCode }}
              />
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
              <div className="absolute inset-0">
                <div className="absolute right-0 md:right-6 md:top-2 z-[200] flex gap-2">
                  <Button
                    onClick={() => setCurrentEditorTab('ts')}
                    accent={currentEditorTab === 'ts'}
                  >
                    TS
                  </Button>
                  <Button
                    onClick={() => setCurrentEditorTab('html')}
                    accent={currentEditorTab === 'html'}
                  >
                    HTML
                  </Button>
                </div>
                {currentEditorTab === 'ts' ? (
                  <CodeEditor code={code} onCodeChange={handleCodeChange} />
                ) : (
                  <HtmlCodeEditor code={htmlCode} onCodeChange={setHtmlCode} />
                )}
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
