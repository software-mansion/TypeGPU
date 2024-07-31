import { useAtomValue, useSetAtom } from 'jotai';
import { Suspense, useEffect, useRef } from 'react';
import { codeEditorShownAtom } from '../utils/examples/codeEditorShownAtom';
import { currentExampleAtom } from '../utils/examples/currentExampleAtom';
import { examples } from '../utils/examples/exampleContent';
import { ExampleNotFound } from './ExampleNotFound';
import { ExampleView } from './ExampleView';

const getRandomExampleKey = () => {
  const keys = Object.keys(examples);
  const randomIdx = Math.floor(Math.random() * keys.length);
  return keys[randomIdx];
};

/**
 * The example we want to show off first.
 */
const FLAGSHIP = 'voxel-rendering';

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
  const codeEditorShown = useAtomValue(codeEditorShownAtom);

  const content = (() => {
    if (!currentExample) {
      return <RedirectToFlagship />;
    }

    if (currentExample in examples) {
      return (
        <ExampleView
          key={currentExample}
          example={examples[currentExample]}
          codeEditorShowing={codeEditorShown}
        />
      );
    }

    return <ExampleNotFound />;
  })();

  return (
    <main className="flex-1 flex flex-col bg-[#f6f6ff]">
      <Suspense fallback={'Loading...'}>{content}</Suspense>
    </main>
  );
}

export default ExamplePage;
