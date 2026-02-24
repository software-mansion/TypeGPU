import { useAtomValue, useSetAtom } from 'jotai';
import { Suspense, useEffect, useRef } from 'react';
import { currentExampleAtom } from '../utils/examples/currentExampleAtom.ts';
import { common, examples } from '../examples/exampleContent.ts';
import { ExampleNotFound } from './ExampleNotFound.tsx';
import { ExampleView } from './ExampleView.tsx';

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
        <ExampleView
          key={currentExample}
          example={examples[currentExample]}
          common={common}
        />
      );
    }

    return <ExampleNotFound />;
  })();

  return (
    <main className='max-w-full flex-1'>
      <Suspense fallback={'Loading...'}>{content}</Suspense>
    </main>
  );
}

export default ExamplePage;
