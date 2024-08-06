import { useAtomValue, useSetAtom } from 'jotai';
import { Suspense, useEffect, useRef } from 'react';
import { codeEditorShownAtom } from '../utils/examples/codeEditorShownAtom';
import { currentExampleAtom } from '../utils/examples/currentExampleAtom';
import { PLAYGROUND_KEY, examples } from '../utils/examples/exampleContent';
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
const FLAGSHIP = 'rendering--box-raytracing';

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

    if (currentExample.startsWith(PLAYGROUND_KEY)) {
      return (
        <ExampleView
          key={PLAYGROUND_KEY}
          example={{
            key: PLAYGROUND_KEY,
            code:
              currentExample === PLAYGROUND_KEY
                ? localStorage.getItem(PLAYGROUND_KEY) ?? ''
                : decodeURIComponent(
                    currentExample.slice(PLAYGROUND_KEY.length),
                  ),
            metadata: {
              title: 'Playground',
              category: '',
            },
          }}
          isPlayground={true}
          codeEditorShowing={codeEditorShown}
        />
      );
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
