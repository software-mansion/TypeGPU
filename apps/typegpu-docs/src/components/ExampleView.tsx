import { type FileSystemTree, WebContainer } from '@webcontainer/api';
import cs from 'classnames';
import { useAtomValue } from 'jotai';
import { useEffect, useMemo, useState } from 'react';
import { debounce } from 'remeda';
import { type TreeNode, pathToTree } from 'to-path-tree';
import {
  codeEditorShownAtom,
  codeEditorShownMobileAtom,
} from '../utils/examples/codeEditorShownAtom';
import type { Example } from '../utils/examples/types';
import useEvent from '../utils/useEvent';
import { HtmlCodeEditor, TsCodeEditor } from './CodeEditor';
import { ControlPanel } from './ControlPanel';

type Props = {
  example: Example;
  isPlayground?: boolean;
};

type EditorTab = 'ts' | 'html';

const webcontainerInstance = await WebContainer.boot();
const files = import.meta.glob('../../../typegpu-sandbox/**/*', {
  eager: true,
  query: '?raw',
});

async function startServer() {
  const fileTree = transformNode(
    pathToTree(
      Object.keys(files).map((file) =>
        file.replace('../../../typegpu-sandbox/', ''),
      ),
    ),
  );

  console.log(fileTree);

  await webcontainerInstance.mount(fileTree);
  const installProcess = await webcontainerInstance.spawn('pnpm', ['install']);

  installProcess.output.pipeTo(
    new WritableStream({
      write(data) {
        console.log(data);
      },
    }),
  );

  const installExitCode = await installProcess.exit;
  if (installExitCode !== 0) {
    throw new Error('Unable to run pnpm install');
  }
  await webcontainerInstance.spawn('pnpm', ['dev']);
}

function transformNode(node: TreeNode<unknown>) {
  const transformed: FileSystemTree = {};

  for (const item of node.items) {
    transformed[item.file] = {
      file: {
        contents: (
          files[`../../../typegpu-sandbox/${item.path}`] as { default: string }
        ).default,
      },
    };
  }

  if (node.subDirectory) {
    for (const [name, subdir] of Object.entries(node.subDirectory)) {
      transformed[name] = {
        directory: transformNode(subdir),
      };
    }
  }

  return transformed;
}

export function ExampleView({ example }: Props) {
  useEffect(() => {
    startServer();
    webcontainerInstance.on('server-ready', (port, url) => {
      console.log('url:', url);
      setServerUrl(url);
    });
  }, []);

  const { tsCode: initialTsCode, htmlCode: intitialHtmlCode } = example;

  const [code, setCode] = useState(initialTsCode);
  const [serverUrl, setServerUrl] = useState<string | undefined>(undefined);
  const [htmlCode, setHtmlCode] = useState(intitialHtmlCode);
  const [currentEditorTab, setCurrentEditorTab] = useState<EditorTab>('ts');

  const codeEditorShowing = useAtomValue(codeEditorShownAtom);
  const codeEditorMobileShowing = useAtomValue(codeEditorShownMobileAtom);

  const setTsCodeDebouncer = useMemo(
    () => debounce(setCode, { waitMs: 500 }),
    [],
  );
  const handleTsCodeChange = useEvent((newCode: string) => {
    setTsCodeDebouncer.call(newCode);
  });

  const setHtmlCodeDebouncer = useMemo(
    () => debounce(setHtmlCode, { waitMs: 500 }),
    [],
  );
  const handleHtmlCodeChange = useEvent((newCode: string) => {
    setHtmlCodeDebouncer.call(newCode);
  });

  useEffect(() => {
    setCode(initialTsCode);
    setHtmlCode(intitialHtmlCode);
  }, [initialTsCode, intitialHtmlCode]);

  return (
    <>
      <div className="flex flex-col h-full">
        <div
          className={cs(
            'flex-1 grid gap-4',
            codeEditorShowing ? 'md:grid-rows-2' : '',
          )}
        >
          <iframe
            className={cs(
              'flex justify-evenly items-center flex-wrap overflow-auto h-full w-full box-border',
              codeEditorShowing ? 'md:max-h-[calc(50vh-3rem)]' : '',
            )}
            src={serverUrl}
            title="sandbox"
          />

          <ControlPanel />

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
                <EditorTabButtonPanel
                  currentEditorTab={currentEditorTab}
                  setCurrentEditorTab={setCurrentEditorTab}
                />

                <TsCodeEditor
                  shown={currentEditorTab === 'ts'}
                  code={code}
                  onCodeChange={handleTsCodeChange}
                />

                <HtmlCodeEditor
                  shown={currentEditorTab === 'html'}
                  code={htmlCode}
                  onCodeChange={handleHtmlCodeChange}
                />
              </div>
            </div>
          ) : null}
        </div>
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
        onClick={() => setCurrentEditorTab('ts')}
      >
        TS
      </button>
      <button
        className={cs(
          commonStyle,
          'rounded-r-lg',
          currentEditorTab === 'html' ? activeStyle : inactiveStyle,
        )}
        type="button"
        onClick={() => setCurrentEditorTab('html')}
      >
        HTML
      </button>
    </div>
  );
}
