import { useAtomValue, useSetAtom } from 'jotai';
import { Suspense, useEffect, useRef } from 'react';
import { currentExampleAtom } from '../utils/examples/currentExampleAtom.ts';
import { common, examples } from '../examples/exampleContent.ts';
import { ExampleNotFound } from './ExampleNotFound.tsx';
import { ExampleView } from './ExampleView.tsx';

// This setup is required for tsover to work, because monaco-react won't use custom monaco without `loader.config()`
// Integration docs: https://github.com/microsoft/monaco-editor/blob/main/docs/integrate-esm.md
import { loader } from '@monaco-editor/react';
import * as monaco from 'tsover-monaco-editor';
// oxlint-disable-next-line import/default
import editorWorker from 'tsover-monaco-editor/esm/vs/editor/editor.worker?worker';
// oxlint-disable-next-line import/default
import jsonWorker from 'tsover-monaco-editor/esm/vs/language/json/json.worker?worker';
// oxlint-disable-next-line import/default
import cssWorker from 'tsover-monaco-editor/esm/vs/language/css/css.worker?worker';
// oxlint-disable-next-line import/default
import htmlWorker from 'tsover-monaco-editor/esm/vs/language/html/html.worker?worker';
// oxlint-disable-next-line import/default
import tsWorker from 'tsover-monaco-editor/esm/vs/language/typescript/ts.worker?worker';

self.MonacoEnvironment = {
  getWorker(_, label) {
    switch (label) {
      case 'json':
        return new jsonWorker();
      case 'css':
        return new cssWorker();
      case 'html':
        return new htmlWorker();
      case 'typescript':
      case 'javascript':
        return new tsWorker();
      default:
        return new editorWorker();
    }
  },
};

loader.config({ monaco });

const getRandomExampleKey = () => {
  const keys = Object.keys(examples);
  const randomIdx = Math.floor(Math.random() * keys.length);
  return keys[randomIdx];
};

/**
 * The example we want to show off first.
 */
const FLAGSHIP = 'rendering--caustics';

function RedirectToFlagship() {
  const setCurrentExample = useSetAtom(currentExampleAtom);
  const redirectedRef = useRef(false);

  useEffect(() => {
    if (redirectedRef.current) {
      return;
    }
    redirectedRef.current = true;

    setCurrentExample(FLAGSHIP in examples ? FLAGSHIP : getRandomExampleKey());
  }, [setCurrentExample]);

  return null;
}

function ExamplePage() {
  const currentExample = useAtomValue(currentExampleAtom);

  const content = (() => {
    if (!currentExample) {
      return <RedirectToFlagship />;
    }

    if (currentExample in examples) {
      return (
        <ExampleView key={currentExample} example={examples[currentExample]} common={common} />
      );
    }

    return <ExampleNotFound />;
  })();

  return (
    <main className="max-w-full flex-1">
      <Suspense fallback={'Loading...'}>{content}</Suspense>
    </main>
  );
}

export default ExamplePage;
