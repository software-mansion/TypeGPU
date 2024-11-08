import cs from 'classnames';
import { useAtomValue, useSetAtom } from 'jotai';
import { Suspense, useEffect, useRef } from 'react';
import { currentExampleAtom } from '../utils/examples/currentExampleAtom';
import { examples, examplesStable } from '../utils/examples/exampleContent';
import { sandboxShownAtom } from '../utils/examples/sandboxShownAtom';
import { ExampleNotFound } from './ExampleNotFound';
import { ExampleView } from './ExampleView';

const getRandomExampleKey = () => {
  const keys = Object.keys(examplesStable);
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

    setCurrentExample(
      FLAGSHIP in examplesStable ? FLAGSHIP : getRandomExampleKey(),
    );
  }, [setCurrentExample]);

  return null;
}

function ExamplePage() {
  const currentExample = useAtomValue(currentExampleAtom);
  const sandboxShown = useAtomValue(sandboxShownAtom);

  const content = (() => {
    if (!currentExample) {
      return <RedirectToFlagship />;
    }

    // if (currentExample === PLAYGROUND_KEY) {
    //   setCurrentExample(
    //     `${PLAYGROUND_KEY}${localStorage.getItem(PLAYGROUND_KEY) ?? ''}`,
    //   );
    // }

    // if (currentExample.startsWith(PLAYGROUND_KEY)) {
    //   return (
    //     <ExampleView
    //       key={PLAYGROUND_KEY}
    //       example={{
    //         key: PLAYGROUND_KEY,
    //         code:
    //           decompressFromEncodedURIComponent(
    //             currentExample.slice(PLAYGROUND_KEY.length),
    //           ) ?? '',
    //         metadata: {
    //           title: 'Playground',
    //           category: '',
    //         },
    //       }}
    //       isPlayground={true}
    //     />
    //   );
    // }

    if (currentExample in examples) {
      return (
        <>
          <div className={cs('h-full', sandboxShown ? 'block' : 'hidden')}>
            <div id="sandbox" />
          </div>
          {sandboxShown ? null : (
            <ExampleView
              key={currentExample}
              example={examples[currentExample]}
            />
          )}
        </>
      );
    }

    return <ExampleNotFound />;
  })();

  return (
    <main className="flex-1">
      <Suspense fallback={'Loading...'}>{content}</Suspense>
    </main>
  );
}

export default ExamplePage;
